const DefaultHeadImgColors = [
  ['#C6F2F3', '#0C6066'],
  ['#FFF5AB', '#896406'],
  ['#FFCCA7', '#8F4500'],
  ['#FFCECE', '#AF1212'],
  ['#E3DEFF', '#511AAB'],
];

// TODO: move this back to AFFiNE repo
export async function createDefaultUserAvatar(
  workspaceName: string
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.height = 100;
  canvas.width = 100;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Failed to create avatar canvas');
  }
  const randomNumber = Math.floor(Math.random() * 5);
  const randomColor = DefaultHeadImgColors[randomNumber];
  context.fillStyle = randomColor[0];
  context.fillRect(0, 0, 100, 100);
  context.font = "600 50px 'PingFang SC', 'Microsoft Yahei'";
  context.fillStyle = randomColor[1];
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(workspaceName[0], 50, 50);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob === null) {
        reject(new Error('Failed to convert avatar canvas to blob'));
      } else {
        resolve(blob);
      }
    }, 'image/png');
  });
}
