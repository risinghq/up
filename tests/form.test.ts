import { expect, test } from "bun:test";
import { normalizePhone } from "../src/worker/form";

test.each([
  ["987654321", "+51987654321"],
  ["987 654 321", "+51987654321"],
  ["(987) 654-321", "+51987654321"],
  ["51987654321", "+51987654321"],
  ["+51 987 654 321", "+51987654321"],
  ["+1 415 555 0100", "+14155550100"],
  ["0034 612 345 678", "+34612345678"],
])("normalizePhone(%p) is %p", (raw, e164) => {
  expect(normalizePhone(raw)).toBe(e164);
});

test.each(["", "12345", "887654321", "phone", "+12"])(
  "normalizePhone(%p) refuses",
  (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  },
);
