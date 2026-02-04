import axios, { AxiosInstance } from 'axios';

export interface FigmaFileInfo {
  key: string;
  name: string;
  lastModified: string;
}

export interface CreateFileResponse {
  key: string;
  name: string;
}

export interface ImageUploadResponse {
  imageRef: string;
}

export class FigmaClient {
  private client: AxiosInstance;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.client = axios.create({
      baseURL: 'https://api.figma.com/v1',
      headers: {
        'X-Figma-Token': token,
        'Content-Type': 'application/json',
      },
    });
  }

  // 파일 정보 가져오기
  async getFile(fileKey: string): Promise<any> {
    const response = await this.client.get(`/files/${fileKey}`);
    return response.data;
  }

  // 프로젝트 내 파일 목록 가져오기
  async getProjectFiles(projectId: string): Promise<FigmaFileInfo[]> {
    const response = await this.client.get(`/projects/${projectId}/files`);
    return response.data.files;
  }

  // 이미지 업로드
  async uploadImage(imageBuffer: Buffer): Promise<string> {
    const response = await this.client.post(
      '/images',
      imageBuffer,
      {
        headers: {
          'Content-Type': 'image/png',
          'X-Figma-Token': this.token,
        },
      }
    );
    return response.data.meta.images[Object.keys(response.data.meta.images)[0]];
  }

  // Plugin API를 위한 WebSocket 연결 정보 (향후 확장용)
  getPluginApiInfo(): string {
    return `
Figma REST API 제한사항:
- REST API로는 직접 노드 생성이 불가능합니다.
- 파일 읽기, 이미지 내보내기, 댓글 등만 지원합니다.

권장 솔루션:
1. Figma Plugin 개발: 실제 노드 생성 가능
2. .fig 파일 직접 생성: Figma 파일 포맷 분석 필요
3. 중간 포맷 사용: JSON으로 레이어 정보 내보내고 Figma Plugin으로 import

현재 이 도구는 중간 포맷(JSON)을 생성하고,
Figma Plugin을 통해 import하는 방식을 사용합니다.
    `.trim();
  }

  // 토큰 유효성 검사
  async validateToken(): Promise<boolean> {
    try {
      const response = await this.client.get('/me');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  // 사용자 정보 가져오기
  async getMe(): Promise<{ id: string; email: string; handle: string }> {
    const response = await this.client.get('/me');
    return response.data;
  }
}
