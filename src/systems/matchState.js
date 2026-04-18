export function getMatchStateCallout({
  redBefore,
  blueBefore,
  redAfter,
  blueAfter,
  winScore,
}) {
  const redWins = redAfter >= winScore;
  const blueWins = blueAfter >= winScore;

  if (redWins) return 'WINNER! RIB!';
  if (blueWins) return 'WINNER! RIB!';

  const isFinalPoint = redAfter === winScore - 1 && blueAfter === winScore - 1;
  if (isFinalPoint) return 'FINAL POINT';

  const isTie = redAfter === blueAfter && redAfter > 0;
  if (isTie) return 'TIED MATCH';

  const redMatchPoint = redAfter === winScore - 1 && redAfter > blueAfter;
  if (redMatchPoint) return 'MATCH POINT: RIB';

  const blueMatchPoint = blueAfter === winScore - 1 && blueAfter > redAfter;
  if (blueMatchPoint) return 'MATCH POINT: BIT';

  const redWasLeading = redBefore > blueBefore;
  const blueWasLeading = blueBefore > redBefore;
  const redLeadsNow = redAfter > blueAfter;
  const blueLeadsNow = blueAfter > redAfter;

  if (redLeadsNow && !redWasLeading) {
    return 'RIB TAKES THE LEAD';
  }

  if (blueLeadsNow && !blueWasLeading) {
    return 'BIT TAKES THE LEAD';
  }

  return null;
}