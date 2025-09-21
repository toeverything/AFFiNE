export interface PayWallPlugin {
  showPayWall(options: {
    type: string;
  }): Promise<{ success: boolean; type: string }>;
}
