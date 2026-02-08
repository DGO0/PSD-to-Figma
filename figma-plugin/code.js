"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // code.ts
  var require_code = __commonJS({
    "code.ts"() {
      var imageStore = /* @__PURE__ */ new Map();
      function safeBase64Decode(data) {
        if (typeof data === "string" && data.length > 0) {
          try {
            return figma.base64Decode(data);
          } catch (e) {
            console.error("base64Decode failed:", e);
            return null;
          }
        }
        return null;
      }
      figma.showUI(__html__, { width: 450, height: 350 });
      figma.ui.onmessage = async (msg) => {
        if (msg.type === "import-psd") {
          if (!msg.data) {
            figma.notify("No data provided");
            return;
          }
          try {
            if (msg.images && typeof msg.images === "object") {
              imageStore.clear();
              const imageEntries = Object.entries(msg.images);
              console.log(`Received ${imageEntries.length} images from UI`);
              for (const [fileName, base64Data] of imageEntries) {
                const decoded = safeBase64Decode(base64Data);
                if (decoded) {
                  imageStore.set(fileName, decoded);
                } else {
                  console.log(`Failed to decode image: ${fileName}`);
                }
              }
              console.log(`Successfully loaded ${imageStore.size} images`);
              const imageNames = Array.from(imageStore.keys()).slice(0, 5);
              console.log(`First images: ${imageNames.join(", ")}`);
            } else {
              console.log("No images received from UI");
            }
            await importPsdData(msg.data);
            figma.notify("PSD imported successfully!");
            figma.ui.postMessage({ type: "import-complete" });
          } catch (error) {
            figma.notify(`Error: ${error}`);
            console.error(error);
          }
        }
        if (msg.type === "cancel") {
          figma.closePlugin();
        }
      };
      function yieldToFigma() {
        return new Promise((resolve) => setTimeout(resolve, 0));
      }
      function countNodes(nodes) {
        let count = 0;
        for (const node of nodes) {
          count++;
          if (node.children) {
            count += countNodes(node.children);
          }
        }
        return count;
      }
      var processedNodes = 0;
      var totalNodes = 0;
      async function importPsdData(data) {
        totalNodes = countNodes(data.nodes);
        processedNodes = 0;
        console.log(`Total nodes to process: ${totalNodes}`);
        figma.notify(`${totalNodes}\uAC1C \uB178\uB4DC \uCC98\uB9AC \uC2DC\uC791...`, { timeout: 2e3 });
        const mainFrame = figma.createFrame();
        mainFrame.name = data.name;
        mainFrame.resize(data.canvas.width, data.canvas.height);
        mainFrame.x = figma.viewport.center.x - data.canvas.width / 2;
        mainFrame.y = figma.viewport.center.y - data.canvas.height / 2;
        mainFrame.clipsContent = true;
        await createNodesWithClipping(data.nodes, mainFrame);
        figma.viewport.scrollAndZoomIntoView([mainFrame]);
        figma.currentPage.selection = [mainFrame];
        console.log(`Import complete: ${processedNodes} nodes processed`);
      }
      async function createNodesWithClipping(nodes, parent) {
        let i = 0;
        while (i < nodes.length) {
          const currentNode = nodes[i];
          if (!currentNode.clipping) {
            const clippingNodes = [];
            let j = i + 1;
            while (j < nodes.length && nodes[j].clipping) {
              clippingNodes.push(nodes[j]);
              j++;
            }
            if (clippingNodes.length > 0) {
              await createClippingGroup(currentNode, clippingNodes, parent);
              i = j;
            } else {
              await createNode(currentNode, parent);
              i++;
            }
          } else {
            await createNode(currentNode, parent);
            i++;
          }
        }
      }
      async function createClippingGroup(baseNode, clippingNodes, parent) {
        var clipX = baseNode.x;
        var clipY = baseNode.y;
        var clipW = baseNode.width;
        var clipH = baseNode.height;
        var frameW = clipW;
        var frameH = clipH;
        var clipFrame = figma.createFrame();
        parent.appendChild(clipFrame);
        clipFrame.name = baseNode.name + " [Clipping Group]";
        clipFrame.x = clipX;
        clipFrame.y = clipY;
        clipFrame.resize(Math.max(1, frameW), Math.max(1, frameH));
        clipFrame.clipsContent = true;
        clipFrame.fills = [];
        var baseCreated = await createNodeInFrame(baseNode, clipFrame, 0, 0);
        if (baseCreated) {
          console.log("Clipping base created: " + baseNode.name);
        }
        for (var cj = 0; cj < clippingNodes.length; cj++) {
          var clipNode = clippingNodes[cj];
          var offsetX = clipNode.x - clipX;
          var offsetY = clipNode.y - clipY;
          await createNodeInFrame(clipNode, clipFrame, offsetX, offsetY);
        }
      }
      async function createNodeInFrame(nodeData, parent, offsetX, offsetY) {
        const node = await createNodeBase(nodeData, parent);
        if (node) {
          node.x = offsetX;
          node.y = offsetY;
          node.name = nodeData.name;
          node.visible = nodeData.visible;
          if ("opacity" in node) {
            node.opacity = nodeData.opacity;
          }
          if ("blendMode" in node && isValidBlendMode(nodeData.blendMode)) {
            node.blendMode = nodeData.blendMode;
          }
        }
        return node;
      }
      async function createNode(nodeData, parent) {
        processedNodes++;
        if (processedNodes % 20 === 0) {
          const percent = Math.round(processedNodes / totalNodes * 100);
          console.log(`Processing: ${processedNodes}/${totalNodes} (${percent}%)`);
          await yieldToFigma();
        }
        let node = null;
        if (nodeData.mask && nodeData.mask.enabled) {
          node = await createMaskedNode(nodeData, parent);
        } else {
          node = await createNodeBase(nodeData, parent);
        }
        if (node) {
          node.name = nodeData.name;
          node.visible = nodeData.visible;
          if ("opacity" in node) {
            node.opacity = nodeData.opacity;
          }
          if ("blendMode" in node && isValidBlendMode(nodeData.blendMode)) {
            node.blendMode = nodeData.blendMode;
          }
        }
        return node;
      }
      async function createNodeBase(nodeData, parent) {
        let node = null;
        switch (nodeData.type) {
          case "GROUP":
            node = await createGroup(nodeData, parent);
            break;
          case "TEXT":
            node = await createText(nodeData, parent);
            break;
          case "RECTANGLE":
          case "VECTOR":
          default:
            node = await createRectangle(nodeData, parent);
            break;
        }
        return node;
      }
      async function createMaskedNode(nodeData, parent) {
        var mask = nodeData.mask;
        if (!mask) return null;
        var defaultColor = mask.defaultColor != null ? mask.defaultColor : 0;
        if (defaultColor === 255) {
          var contentNodeData2 = {};
          for (var k in nodeData) {
            contentNodeData2[k] = nodeData[k];
          }
          contentNodeData2.mask = void 0;
          var contentNode2 = await createNodeBase(contentNodeData2, parent);
          return contentNode2;
        }
        var maskBounds = mask.bounds;
        if (maskBounds.width <= 0 || maskBounds.height <= 0) {
          var contentNodeData3 = {};
          for (var k2 in nodeData) {
            contentNodeData3[k2] = nodeData[k2];
          }
          contentNodeData3.mask = void 0;
          return await createNodeBase(contentNodeData3, parent);
        }
        var maskFrame = figma.createFrame();
        parent.appendChild(maskFrame);
        maskFrame.name = nodeData.name;
        maskFrame.x = maskBounds.x;
        maskFrame.y = maskBounds.y;
        maskFrame.resize(Math.max(1, maskBounds.width), Math.max(1, maskBounds.height));
        maskFrame.clipsContent = true;
        maskFrame.fills = [];
        var maskImageData = null;
        if (mask.imageFileName) {
          maskImageData = imageStore.get(mask.imageFileName) || null;
        } else if (mask.imageData) {
          maskImageData = safeBase64Decode(mask.imageData);
        }
        if (maskImageData) {
          try {
            var maskImg = figma.createImage(maskImageData);
            var maskRect = figma.createRectangle();
            maskFrame.appendChild(maskRect);
            maskRect.name = "Mask";
            maskRect.x = 0;
            maskRect.y = 0;
            maskRect.resize(Math.max(1, maskBounds.width), Math.max(1, maskBounds.height));
            maskRect.fills = [{ type: "IMAGE", imageHash: maskImg.hash, scaleMode: "FILL" }];
            maskRect.isMask = true;
          } catch (e) {
            console.log("Failed to create mask image: " + e);
          }
        }
        var contentNodeData = {};
        for (var k3 in nodeData) {
          contentNodeData[k3] = nodeData[k3];
        }
        contentNodeData.mask = void 0;
        var contentNode = await createNodeBase(contentNodeData, maskFrame);
        if (contentNode) {
          contentNode.x = nodeData.x - maskBounds.x;
          contentNode.y = nodeData.y - maskBounds.y;
        }
        return maskFrame;
      }
      async function createGroup(nodeData, parent) {
        if (!nodeData.children || nodeData.children.length === 0) {
          return null;
        }
        const hasClipping = nodeData.children.some((child) => child.clipping);
        if (hasClipping) {
          const frame = figma.createFrame();
          parent.appendChild(frame);
          frame.name = nodeData.name;
          frame.x = nodeData.x;
          frame.y = nodeData.y;
          frame.resize(Math.max(1, nodeData.width), Math.max(1, nodeData.height));
          frame.clipsContent = true;
          frame.fills = [];
          const adjustedChildren = nodeData.children.map((child) => __spreadProps(__spreadValues({}, child), {
            x: child.x - nodeData.x,
            y: child.y - nodeData.y
          }));
          await createNodesWithClipping(adjustedChildren, frame);
          return frame;
        }
        const children = [];
        for (const childData of nodeData.children) {
          const child = await createNode(childData, parent);
          if (child) {
            children.push(child);
          }
        }
        if (children.length === 0) {
          return null;
        }
        const group = figma.group(children, parent);
        group.name = nodeData.name;
        group.x = nodeData.x;
        group.y = nodeData.y;
        return group;
      }
      var FONT_MAPPING = {
        "Pretendard": {
          family: "Inter",
          styleMap: {
            "Black": "Bold",
            "ExtraBold": "Bold",
            "Bold": "Bold",
            "SemiBold": "Semi Bold",
            "Medium": "Medium",
            "Regular": "Regular",
            "Light": "Light",
            "ExtraLight": "Light",
            "Thin": "Thin"
          }
        },
        "Pretendard Variable": {
          family: "Inter",
          styleMap: {
            "Black": "Bold",
            "Bold": "Bold",
            "SemiBold": "Semi Bold",
            "Medium": "Medium",
            "Regular": "Regular",
            "Light": "Light",
            "Thin": "Thin"
          }
        },
        "MADEOuterSans": {
          family: "Inter",
          styleMap: {
            "Black": "Bold",
            "Bold": "Bold",
            "Medium": "Medium",
            "Regular": "Regular",
            "Light": "Light",
            "Thin": "Thin"
          }
        },
        "MADEOuterSans-Medium": {
          family: "Inter",
          styleMap: { "Regular": "Medium" }
        },
        "NanumGothic": {
          family: "Inter",
          styleMap: {
            "Bold": "Bold",
            "ExtraBold": "Bold",
            "Regular": "Regular"
          }
        },
        "NanumSquare": {
          family: "Inter",
          styleMap: {
            "ExtraBold": "Bold",
            "Bold": "Bold",
            "Regular": "Regular",
            "Light": "Light"
          }
        },
        "Noto Sans KR": {
          family: "Inter",
          styleMap: {
            "Black": "Bold",
            "Bold": "Bold",
            "Medium": "Medium",
            "Regular": "Regular",
            "Light": "Light",
            "Thin": "Thin"
          }
        }
      };
      var DEFAULT_STYLE_MAP = {
        "Black": "Bold",
        "ExtraBold": "Bold",
        "Bold": "Bold",
        "SemiBold": "Semi Bold",
        "Semi Bold": "Semi Bold",
        "Medium": "Medium",
        "Regular": "Regular",
        "Light": "Light",
        "ExtraLight": "Light",
        "Extra Light": "Light",
        "Thin": "Thin",
        "Italic": "Italic",
        "Bold Italic": "Bold Italic",
        "BoldItalic": "Bold Italic"
      };
      var DEFAULT_FALLBACK_FONT = { family: "Inter", style: "Regular" };
      async function tryLoadFont(family, style) {
        try {
          const timeout = new Promise(
            (_, reject) => setTimeout(() => reject(new Error("Font load timeout")), 3e3)
          );
          const loadFont = figma.loadFontAsync({ family, style }).then(() => true);
          await Promise.race([loadFont, timeout]);
          return true;
        } catch (e) {
          return false;
        }
      }
      async function loadFontWithFallback(family, style) {
        const originalFont = `${family}-${style || "Regular"}`;
        if (await tryLoadFont(family, style || "Regular")) {
          return { family, style: style || "Regular" };
        }
        const mapping = FONT_MAPPING[family];
        if (mapping) {
          const mappedStyle = mapping.styleMap[style || "Regular"] || mapping.styleMap["Regular"] || "Regular";
          if (await tryLoadFont(mapping.family, mappedStyle)) {
            console.log(`Font mapped: ${originalFont} \u2192 ${mapping.family}-${mappedStyle}`);
            figma.notify(`\uD3F0\uD2B8 \uB300\uCCB4: ${originalFont} \u2192 ${mapping.family}-${mappedStyle}`, { timeout: 2e3 });
            return { family: mapping.family, style: mappedStyle };
          }
        }
        const fallbackStyle = DEFAULT_STYLE_MAP[style || "Regular"] || "Regular";
        const interStyles = [fallbackStyle, "Regular", "Medium", "Bold"];
        for (const tryStyle of interStyles) {
          if (await tryLoadFont("Inter", tryStyle)) {
            console.log(`Font fallback: ${originalFont} \u2192 Inter-${tryStyle}`);
            figma.notify(`\uD3F0\uD2B8 \uB300\uCCB4: ${originalFont} \u2192 Inter-${tryStyle}`, { timeout: 2e3 });
            return { family: "Inter", style: tryStyle };
          }
        }
        console.log(`Font fallback (forced): ${originalFont} \u2192 Inter-Regular`);
        return DEFAULT_FALLBACK_FONT;
      }
      async function createText(nodeData, parent) {
        var _a, _b, _c, _d, _e;
        if (!nodeData.text) {
          return null;
        }
        const text = figma.createText();
        parent.appendChild(text);
        const fontFamily = ((_a = nodeData.textStyle) == null ? void 0 : _a.fontFamily) || "Inter";
        const fontStyle = ((_b = nodeData.textStyle) == null ? void 0 : _b.fontStyle) || "Regular";
        let loadedFont;
        try {
          loadedFont = await loadFontWithFallback(fontFamily, fontStyle);
        } catch (e) {
          console.error(`Failed to load any font for: ${fontFamily} ${fontStyle}`);
          await figma.loadFontAsync({ family: "Inter", style: "Regular" });
          loadedFont = { family: "Inter", style: "Regular" };
        }
        text.fontName = loadedFont;
        text.characters = nodeData.text;
        if (nodeData.textStyle) {
          text.fontSize = Math.round(nodeData.textStyle.fontSize * 100) / 100;
          if (nodeData.textStyle.color) {
            const { r, g, b } = nodeData.textStyle.color;
            text.fills = [{
              type: "SOLID",
              color: { r: r / 255, g: g / 255, b: b / 255 }
            }];
          }
          if (nodeData.textStyle.letterSpacing) {
            text.letterSpacing = { value: nodeData.textStyle.letterSpacing, unit: "PIXELS" };
          }
          const isMultiLine = (_c = nodeData.text) == null ? void 0 : _c.includes("\n");
          if (nodeData.textStyle.lineHeight && isMultiLine) {
            text.lineHeight = { value: nodeData.textStyle.lineHeight, unit: "PIXELS" };
          }
        }
        if (nodeData.styleRuns && nodeData.styleRuns.length > 0) {
          let currentPos = 0;
          for (const run of nodeData.styleRuns) {
            const runLength = run.text.length;
            const startPos = currentPos;
            const endPos = currentPos + runLength;
            if (run.color && startPos < text.characters.length) {
              const actualEnd = Math.min(endPos, text.characters.length);
              const r = run.color.r > 1 ? run.color.r / 255 : run.color.r;
              const g = run.color.g > 1 ? run.color.g / 255 : run.color.g;
              const b = run.color.b > 1 ? run.color.b / 255 : run.color.b;
              text.setRangeFills(startPos, actualEnd, [{
                type: "SOLID",
                color: { r, g, b }
              }]);
            }
            if (run.fontSize && startPos < text.characters.length) {
              const actualEnd = Math.min(endPos, text.characters.length);
              text.setRangeFontSize(startPos, actualEnd, Math.round(run.fontSize * 100) / 100);
            }
            currentPos = endPos;
          }
        }
        const textAlign = ((_d = nodeData.textStyle) == null ? void 0 : _d.textAlign) || "left";
        const alignMap = {
          "left": "LEFT",
          "center": "CENTER",
          "right": "RIGHT",
          "justify": "JUSTIFIED"
        };
        text.textAlignHorizontal = alignMap[textAlign] || "LEFT";
        text.textAutoResize = "WIDTH_AND_HEIGHT";
        text.x = nodeData.x;
        text.y = nodeData.y;
        if ((_e = nodeData.textTransform) == null ? void 0 : _e.rotation) {
          text.rotation = -nodeData.textTransform.rotation;
        }
        return text;
      }
      async function createVectorFromPath(nodeData, parent) {
        var _a, _b;
        const pathData = nodeData.vectorMask.pathData;
        const width = Math.max(1, nodeData.width);
        const height = Math.max(1, nodeData.height);
        let fillR = 0.5, fillG = 0.5, fillB = 0.5;
        let fillOpacity = 1;
        if ((_a = nodeData.vectorFill) == null ? void 0 : _a.color) {
          const c = nodeData.vectorFill.color;
          fillR = c.r > 1 ? c.r / 255 : c.r;
          fillG = c.g > 1 ? c.g / 255 : c.g;
          fillB = c.b > 1 ? c.b / 255 : c.b;
          fillOpacity = (_b = c.a) != null ? _b : 1;
        }
        const svgR = Math.round(fillR * 255);
        const svgG = Math.round(fillG * 255);
        const svgB = Math.round(fillB * 255);
        const fillColor = `#${svgR.toString(16).padStart(2, "0")}${svgG.toString(16).padStart(2, "0")}${svgB.toString(16).padStart(2, "0")}`;
        let strokeAttr = "";
        if (nodeData.vectorStroke) {
          const sc = nodeData.vectorStroke.color;
          const sr = Math.round(sc.r > 1 ? sc.r : sc.r * 255);
          const sg = Math.round(sc.g > 1 ? sc.g : sc.g * 255);
          const sb = Math.round(sc.b > 1 ? sc.b : sc.b * 255);
          const strokeColor = `#${sr.toString(16).padStart(2, "0")}${sg.toString(16).padStart(2, "0")}${sb.toString(16).padStart(2, "0")}`;
          strokeAttr = ` stroke="${strokeColor}" stroke-width="${nodeData.vectorStroke.width}"`;
        }
        const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><path d="${pathData}" fill="${fillColor}" fill-opacity="${fillOpacity}"${strokeAttr}/></svg>`;
        try {
          const svgNode = figma.createNodeFromSvg(svg);
          parent.appendChild(svgNode);
          svgNode.x = nodeData.x;
          svgNode.y = nodeData.y;
          svgNode.name = nodeData.name;
          const figmaFill = {
            type: "SOLID",
            color: { r: fillR, g: fillG, b: fillB },
            opacity: fillOpacity
          };
          if (svgNode.children.length === 1 && svgNode.children[0].type === "VECTOR") {
            const vector = svgNode.children[0];
            const clonedVector = vector.clone();
            parent.appendChild(clonedVector);
            clonedVector.x = nodeData.x;
            clonedVector.y = nodeData.y;
            clonedVector.name = nodeData.name;
            clonedVector.fills = [figmaFill];
            svgNode.remove();
            return clonedVector;
          }
          for (const child of svgNode.children) {
            if (child.type === "VECTOR") {
              child.fills = [figmaFill];
            }
          }
          return svgNode;
        } catch (e) {
          console.error(`Failed to create vector from path: ${nodeData.name}`, e);
          const rect = figma.createRectangle();
          parent.appendChild(rect);
          rect.x = nodeData.x;
          rect.y = nodeData.y;
          rect.resize(width, height);
          rect.name = nodeData.name + " [Vector Failed]";
          rect.fills = [{
            type: "SOLID",
            color: { r: fillR, g: fillG, b: fillB },
            opacity: fillOpacity
          }];
          return rect;
        }
      }
      async function createRectangle(nodeData, parent) {
        var _a, _b, _c;
        if (nodeData.vectorMask && nodeData.vectorMask.pathData) {
          var vecImageData = null;
          if (nodeData.imageFileName) {
            vecImageData = imageStore.get(nodeData.imageFileName) || null;
          }
          if (!vecImageData && nodeData.imageData) {
            vecImageData = safeBase64Decode(nodeData.imageData);
          }
          if (vecImageData) {
            try {
              var vecImg = figma.createImage(vecImageData);
              var vecRect = figma.createRectangle();
              parent.appendChild(vecRect);
              vecRect.x = nodeData.x;
              vecRect.y = nodeData.y;
              vecRect.resize(Math.max(1, nodeData.width), Math.max(1, nodeData.height));
              var vecFills = [{
                type: "IMAGE",
                imageHash: vecImg.hash,
                scaleMode: "FILL"
              }];
              if (nodeData.effects && nodeData.effects.solidFill) {
                var sf = nodeData.effects.solidFill;
                var c = sf.color;
                var r2 = c.r > 1 ? c.r / 255 : c.r;
                var g2 = c.g > 1 ? c.g / 255 : c.g;
                var b2 = c.b > 1 ? c.b / 255 : c.b;
                vecFills = [{
                  type: "SOLID",
                  color: { r: r2, g: g2, b: b2 },
                  opacity: c.a
                }];
              }
              if (nodeData.effects && nodeData.effects.gradientOverlay) {
                vecFills = [createGradientFill(nodeData.effects.gradientOverlay)];
              }
              vecRect.fills = vecFills;
              applyEffects(vecRect, nodeData.effects);
              return vecRect;
            } catch (e) {
              console.log("Vector image load failed, using path: " + nodeData.name);
            }
          }
          var vectorNode = await createVectorFromPath(nodeData, parent);
          if (nodeData.effects && nodeData.effects.solidFill && "fills" in vectorNode) {
            var sf = nodeData.effects.solidFill;
            var c = sf.color;
            var r2 = c.r > 1 ? c.r / 255 : c.r;
            var g2 = c.g > 1 ? c.g / 255 : c.g;
            var b2 = c.b > 1 ? c.b / 255 : c.b;
            vectorNode.fills = [{
              type: "SOLID",
              color: { r: r2, g: g2, b: b2 },
              opacity: c.a
            }];
          }
          if (nodeData.effects && nodeData.effects.gradientOverlay && "fills" in vectorNode) {
            vectorNode.fills = [createGradientFill(nodeData.effects.gradientOverlay)];
          }
          applyEffects(vectorNode, nodeData.effects);
          return vectorNode;
        }
        const rect = figma.createRectangle();
        parent.appendChild(rect);
        rect.x = nodeData.x;
        rect.y = nodeData.y;
        rect.resize(Math.max(1, nodeData.width), Math.max(1, nodeData.height));
        let imageData = null;
        let hasImage = false;
        if (nodeData.imageData) {
          imageData = safeBase64Decode(nodeData.imageData);
        } else if (nodeData.imageFileName) {
          imageData = imageStore.get(nodeData.imageFileName) || null;
          if (!imageData) {
            console.log(`Image not found in store: ${nodeData.imageFileName}, store has: ${imageStore.size} images`);
          }
        }
        if (imageData) {
          try {
            const image = figma.createImage(imageData);
            var imgFills = [{
              type: "IMAGE",
              imageHash: image.hash,
              scaleMode: "FILL"
            }];
            if (nodeData.effects && nodeData.effects.solidFill) {
              var sfImg = nodeData.effects.solidFill;
              var cImg = sfImg.color;
              var rImg = cImg.r > 1 ? cImg.r / 255 : cImg.r;
              var gImg = cImg.g > 1 ? cImg.g / 255 : cImg.g;
              var bImg = cImg.b > 1 ? cImg.b / 255 : cImg.b;
              imgFills = [{
                type: "SOLID",
                color: { r: rImg, g: gImg, b: bImg },
                opacity: cImg.a
              }];
            }
            if (nodeData.effects && nodeData.effects.gradientOverlay) {
              imgFills = [createGradientFill(nodeData.effects.gradientOverlay)];
            }
            rect.fills = imgFills;
            hasImage = true;
          } catch (e) {
            console.log(`Image load failed for: ${nodeData.name}`);
            hasImage = false;
          }
        }
        if (!hasImage) {
          const fills = [];
          if (nodeData.vectorFill) {
            if (nodeData.vectorFill.type === "solid" && nodeData.vectorFill.color) {
              const c2 = nodeData.vectorFill.color;
              const r = c2.r > 1 ? c2.r / 255 : c2.r;
              const g = c2.g > 1 ? c2.g / 255 : c2.g;
              const b = c2.b > 1 ? c2.b / 255 : c2.b;
              fills.push({
                type: "SOLID",
                color: { r, g, b },
                opacity: c2.a
              });
            } else if (nodeData.vectorFill.type === "gradient" && nodeData.vectorFill.gradient) {
              const grad = nodeData.vectorFill.gradient;
              fills.push(createGradientFill(grad));
            }
          }
          if ((_a = nodeData.effects) == null ? void 0 : _a.solidFill) {
            const sf2 = nodeData.effects.solidFill;
            const c2 = sf2.color;
            const r = c2.r > 1 ? c2.r / 255 : c2.r;
            const g = c2.g > 1 ? c2.g / 255 : c2.g;
            const b = c2.b > 1 ? c2.b / 255 : c2.b;
            fills.push({
              type: "SOLID",
              color: { r, g, b },
              opacity: c2.a
            });
          }
          if ((_b = nodeData.effects) == null ? void 0 : _b.gradientOverlay) {
            const grad = nodeData.effects.gradientOverlay;
            fills.push(createGradientFill(grad));
          }
          if (fills.length > 0) {
            rect.fills = fills;
            console.log(`Applied fill to: ${nodeData.name}, fills: ${fills.length}`);
          } else if (nodeData.imageFileName) {
            console.log(`No image data for: ${nodeData.name}, imageFileName: ${nodeData.imageFileName}`);
            rect.fills = [];
          } else {
            rect.fills = [];
          }
        }
        if (nodeData.vectorStroke) {
          const vs = nodeData.vectorStroke;
          rect.strokes = [{
            type: "SOLID",
            color: { r: vs.color.r, g: vs.color.g, b: vs.color.b },
            opacity: vs.color.a
          }];
          rect.strokeWeight = vs.width;
          rect.strokeAlign = vs.alignment === "CENTER" ? "CENTER" : vs.alignment === "INSIDE" ? "INSIDE" : "OUTSIDE";
        }
        if (((_c = nodeData.effects) == null ? void 0 : _c.stroke) && !nodeData.vectorStroke) {
          const strokes = Array.isArray(nodeData.effects.stroke) ? nodeData.effects.stroke : [nodeData.effects.stroke];
          const firstStroke = strokes[0];
          if (firstStroke && firstStroke.color) {
            rect.strokes = [{
              type: "SOLID",
              color: { r: firstStroke.color.r, g: firstStroke.color.g, b: firstStroke.color.b },
              opacity: firstStroke.color.a
            }];
            rect.strokeWeight = firstStroke.weight;
          }
        }
        applyEffects(rect, nodeData.effects);
        return rect;
      }
      function createGradientFill(grad) {
        const angleRad = grad.angle * Math.PI / 180;
        const gradientStops = grad.stops.map((stop) => ({
          position: stop.position,
          color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a }
        }));
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        return {
          type: "GRADIENT_LINEAR",
          gradientStops,
          gradientTransform: [
            [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
            [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5]
          ]
        };
      }
      function applyEffects(node, effects) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F;
        if (!effects) return;
        const figmaEffects = [];
        if (effects.dropShadow) {
          const shadows = Array.isArray(effects.dropShadow) ? effects.dropShadow : [effects.dropShadow];
          for (const shadow of shadows) {
            if (!shadow || !shadow.color) continue;
            const offsetX = (_b = (_a = shadow.offset) == null ? void 0 : _a.x) != null ? _b : 0;
            const offsetY = (_d = (_c = shadow.offset) == null ? void 0 : _c.y) != null ? _d : 0;
            const colorR = (_e = shadow.color.r) != null ? _e : 0;
            const colorG = (_f = shadow.color.g) != null ? _f : 0;
            const colorB = (_g = shadow.color.b) != null ? _g : 0;
            const colorA = (_h = shadow.color.a) != null ? _h : 1;
            const blur = (_i = shadow.blur) != null ? _i : 0;
            const spread = (_j = shadow.spread) != null ? _j : 0;
            figmaEffects.push({
              type: "DROP_SHADOW",
              color: { r: colorR, g: colorG, b: colorB, a: colorA },
              offset: { x: offsetX, y: offsetY },
              radius: blur,
              spread,
              visible: true,
              blendMode: "NORMAL"
            });
          }
        }
        if (effects.innerShadow) {
          const shadows = Array.isArray(effects.innerShadow) ? effects.innerShadow : [effects.innerShadow];
          for (const shadow of shadows) {
            if (!shadow || !shadow.color) continue;
            const offsetX = (_l = (_k = shadow.offset) == null ? void 0 : _k.x) != null ? _l : 0;
            const offsetY = (_n = (_m = shadow.offset) == null ? void 0 : _m.y) != null ? _n : 0;
            const colorR = (_o = shadow.color.r) != null ? _o : 0;
            const colorG = (_p = shadow.color.g) != null ? _p : 0;
            const colorB = (_q = shadow.color.b) != null ? _q : 0;
            const colorA = (_r = shadow.color.a) != null ? _r : 1;
            const blur = (_s = shadow.blur) != null ? _s : 0;
            const spread = (_t = shadow.spread) != null ? _t : 0;
            figmaEffects.push({
              type: "INNER_SHADOW",
              color: { r: colorR, g: colorG, b: colorB, a: colorA },
              offset: { x: offsetX, y: offsetY },
              radius: blur,
              spread,
              visible: true,
              blendMode: "NORMAL"
            });
          }
        }
        if (effects.layerBlur && effects.layerBlur.radius != null) {
          figmaEffects.push({
            type: "LAYER_BLUR",
            radius: effects.layerBlur.radius,
            visible: true
          });
        }
        if (effects.outerGlow && effects.outerGlow.color) {
          const og = effects.outerGlow;
          const colorR = (_u = og.color.r) != null ? _u : 0;
          const colorG = (_v = og.color.g) != null ? _v : 0;
          const colorB = (_w = og.color.b) != null ? _w : 0;
          const colorA = (_x = og.color.a) != null ? _x : 1;
          figmaEffects.push({
            type: "DROP_SHADOW",
            color: { r: colorR, g: colorG, b: colorB, a: colorA },
            offset: { x: 0, y: 0 },
            radius: (_y = og.blur) != null ? _y : 0,
            spread: (_z = og.spread) != null ? _z : 0,
            visible: true,
            blendMode: "NORMAL"
          });
        }
        if (effects.innerGlow && effects.innerGlow.color) {
          const ig = effects.innerGlow;
          const colorR = (_A = ig.color.r) != null ? _A : 0;
          const colorG = (_B = ig.color.g) != null ? _B : 0;
          const colorB = (_C = ig.color.b) != null ? _C : 0;
          const colorA = (_D = ig.color.a) != null ? _D : 1;
          figmaEffects.push({
            type: "INNER_SHADOW",
            color: { r: colorR, g: colorG, b: colorB, a: colorA },
            offset: { x: 0, y: 0 },
            radius: (_E = ig.blur) != null ? _E : 0,
            spread: (_F = ig.spread) != null ? _F : 0,
            visible: true,
            blendMode: "NORMAL"
          });
        }
        if (figmaEffects.length > 0 && "effects" in node) {
          node.effects = figmaEffects;
        }
      }
      function isValidBlendMode(mode) {
        const validModes = [
          "NORMAL",
          "DARKEN",
          "MULTIPLY",
          "COLOR_BURN",
          "LIGHTEN",
          "SCREEN",
          "COLOR_DODGE",
          "OVERLAY",
          "SOFT_LIGHT",
          "HARD_LIGHT",
          "DIFFERENCE",
          "EXCLUSION",
          "HUE",
          "SATURATION",
          "COLOR",
          "LUMINOSITY"
        ];
        return validModes.includes(mode);
      }
    }
  });
  require_code();
})();
