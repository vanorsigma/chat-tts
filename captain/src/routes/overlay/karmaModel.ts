const ANGLE_MIN = -Math.PI / 16;
const ANGLE_MAX = Math.PI / 16;

export interface ScaleSpriteAdjustmentNumbers {
  handleRotation: number;
  leftBowlPosition: { x: number; y: number };
  rightBowlPosition: { x: number; y: number };
}

export function scurve(x: number, k = 20) {
  const t = Math.max(0.0, Math.min(x, 1.0));
  return Math.pow(t, k) / (Math.pow(t, k) + Math.pow(1 - t, k));
}

function moveScaleBowlByAngle(
  origX: number,
  origY: number,
  angle: number,
  side: 'LEFT' | 'RIGHT'
): { x: number; y: number } {
  const adjustment = (angle / (ANGLE_MAX - ANGLE_MIN)) * 6;

  switch (side) {
    case 'LEFT':
      return {
        x: origX * Math.cos(angle) - origY * Math.sin(angle) - adjustment,
        y: origY * Math.cos(angle) + origX * Math.sin(angle)
      };
    case 'RIGHT':
      return {
        x: origX * Math.cos(angle) + origY * Math.sin(angle) + adjustment,
        y: origY * Math.cos(angle) - origX * Math.sin(angle)
      };
  }
}

export function calculateAdjustmentNumbers(
  progress: number,
  currentAngle: number,
  minProgress: number = 0,
  maxProgress: number = 0
): ScaleSpriteAdjustmentNumbers {
  const minP = Math.trunc(minProgress);
  const maxP = Math.trunc(maxProgress);

  const clampedProgress = Math.max(Math.min(progress, maxP), minP);

  let ratio = (clampedProgress - minP) / (maxP - minP);
  ratio = scurve(ratio);

  const targetAngle = ratio * (ANGLE_MAX - ANGLE_MIN) + ANGLE_MIN;

  const leftTargetPosition = moveScaleBowlByAngle(-20, 0, targetAngle - currentAngle, 'LEFT');
  const rightTargetPosition = moveScaleBowlByAngle(21, 0, currentAngle - targetAngle, 'RIGHT');

  return {
    handleRotation: targetAngle,
    leftBowlPosition: leftTargetPosition,
    rightBowlPosition: rightTargetPosition
  };
}
