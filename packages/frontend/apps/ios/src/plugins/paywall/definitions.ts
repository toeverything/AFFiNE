export interface PayWallPlugin {
  showPayWall(options: {
    type: 'Pro' | 'AI';
  }): Promise<{ success: boolean; type: string }>;
}
