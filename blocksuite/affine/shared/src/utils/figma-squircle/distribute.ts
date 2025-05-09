interface RoundedRectangle {
  topLeftCornerRadius: number;
  topRightCornerRadius: number;
  bottomRightCornerRadius: number;
  bottomLeftCornerRadius: number;
  width: number;
  height: number;
}

interface NormalizedCorner {
  radius: number;
  roundingAndSmoothingBudget: number;
}

interface NormalizedCorners {
  topLeft: NormalizedCorner;
  topRight: NormalizedCorner;
  bottomLeft: NormalizedCorner;
  bottomRight: NormalizedCorner;
}

type Corner = keyof NormalizedCorners;

type Side = 'top' | 'left' | 'right' | 'bottom';

interface Adjacent {
  side: Side;
  corner: Corner;
}

export function distributeAndNormalize({
  topLeftCornerRadius,
  topRightCornerRadius,
  bottomRightCornerRadius,
  bottomLeftCornerRadius,
  width,
  height,
}: RoundedRectangle): NormalizedCorners {
  const roundingAndSmoothingBudgetMap: Record<Corner, number> = {
    topLeft: -1,
    topRight: -1,
    bottomLeft: -1,
    bottomRight: -1,
  };

  const cornerRadiusMap: Record<Corner, number> = {
    topLeft: topLeftCornerRadius,
    topRight: topRightCornerRadius,
    bottomLeft: bottomLeftCornerRadius,
    bottomRight: bottomRightCornerRadius,
  };

  Object.entries(cornerRadiusMap)
    // Let the bigger corners choose first
    .sort(([, radius1], [, radius2]) => {
      return radius2 - radius1;
    })
    .forEach(([cornerName, radius]) => {
      const corner = cornerName as Corner;
      const adjacents = adjacentsByCorner[corner];

      // Look at the 2 adjacent sides, figure out how much space we can have on both sides,
      // then take the smaller one
      const budget = Math.min(
        ...adjacents.map(adjacent => {
          const adjacentCornerRadius = cornerRadiusMap[adjacent.corner];
          if (radius === 0 && adjacentCornerRadius === 0) {
            return 0;
          }

          const adjacentCornerBudget =
            roundingAndSmoothingBudgetMap[adjacent.corner];

          const sideLength =
            adjacent.side === 'top' || adjacent.side === 'bottom'
              ? width
              : height;

          // If the adjacent corner's already been given the rounding and smoothing budget,
          // we'll just take the rest
          if (adjacentCornerBudget >= 0) {
            return sideLength - roundingAndSmoothingBudgetMap[adjacent.corner];
          } else {
            return (radius / (radius + adjacentCornerRadius)) * sideLength;
          }
        })
      );

      roundingAndSmoothingBudgetMap[corner] = budget;
      cornerRadiusMap[corner] = Math.min(radius, budget);
    });

  return {
    topLeft: {
      radius: cornerRadiusMap.topLeft,
      roundingAndSmoothingBudget: roundingAndSmoothingBudgetMap.topLeft,
    },
    topRight: {
      radius: cornerRadiusMap.topRight,
      roundingAndSmoothingBudget: roundingAndSmoothingBudgetMap.topRight,
    },
    bottomLeft: {
      radius: cornerRadiusMap.bottomLeft,
      roundingAndSmoothingBudget: roundingAndSmoothingBudgetMap.bottomLeft,
    },
    bottomRight: {
      radius: cornerRadiusMap.bottomRight,
      roundingAndSmoothingBudget: roundingAndSmoothingBudgetMap.bottomRight,
    },
  };
}

const adjacentsByCorner: Record<Corner, Array<Adjacent>> = {
  topLeft: [
    {
      corner: 'topRight',
      side: 'top',
    },
    {
      corner: 'bottomLeft',
      side: 'left',
    },
  ],
  topRight: [
    {
      corner: 'topLeft',
      side: 'top',
    },
    {
      corner: 'bottomRight',
      side: 'right',
    },
  ],
  bottomLeft: [
    {
      corner: 'bottomRight',
      side: 'bottom',
    },
    {
      corner: 'topLeft',
      side: 'left',
    },
  ],
  bottomRight: [
    {
      corner: 'bottomLeft',
      side: 'bottom',
    },
    {
      corner: 'topRight',
      side: 'right',
    },
  ],
};
