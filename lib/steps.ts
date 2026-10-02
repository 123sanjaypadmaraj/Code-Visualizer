/**
 * Choose which trace step to show for a focus line: the last step that ran exactly on
 * that line, else the last step on an earlier line, else the first step.
 */
export function pickStep(a: { steps: { line: number }[] }, focusLine: number | null): number {
  if (!a.steps.length || focusLine === null) return 0;
  const exact = a.steps.map((s) => s.line).lastIndexOf(focusLine);
  if (exact >= 0) return exact;
  let best = 0;
  a.steps.forEach((s, i) => {
    if (s.line <= focusLine) best = i;
  });
  return best;
}
