import { expect, test } from "@playwright/test";
import { buildShareHash } from "../lib/share";

const HELLO = '#include <stdio.h>\nint main() {\n  printf("hello 42\\n");\n  return 0;\n}\n';
const LOOP = "int main() {\n  int x = 0;\n  while (1) { x++; }\n  return 0;\n}\n";

test("runs a program and steps through it", async ({ page }) => {
  await page.goto("/" + buildShareHash(HELLO));
  await page.getByRole("button", { name: /Start Visualizer/ }).click();
  await expect(page.getByText(/Step\s*1\s*of/)).toBeVisible();
  await page.getByRole("button", { name: /Next Step/ }).click();
  await expect(page.getByText(/Step\s*2\s*of/)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/Step\s*3\s*of/)).toBeVisible();
  // last step shows the program output
  for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByText("hello 42").first()).toBeVisible();
});

test("a share link with a step opens the trace at that step", async ({ page }) => {
  await page.goto("/" + buildShareHash(HELLO, 1));
  await expect(page.getByText(/Step\s*2\s*of/)).toBeVisible();
});

test("an endless loop never freezes the page", async ({ page }) => {
  await page.goto("/" + buildShareHash(LOOP));
  await page.getByRole("button", { name: /Start Visualizer/ }).click();
  // the page stays interactive while the worker runs
  await expect(page.getByRole("button", { name: /Running/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reset/ }).or(page.getByRole("alert"))).toBeVisible({ timeout: 15000 });
});
