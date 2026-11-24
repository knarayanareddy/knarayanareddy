/**
 * Guards the links between the profile README and the interactive pages.
 *
 * The dashboard and the terrain are only static <img> cards inside the README —
 * GitHub strips scripts, styles and pointer events, so the interactive build has
 * to live on Pages and be linked by hand. Twice now the README has pointed that
 * link at a host that does not serve the pages. These tests read the README and
 * the Pages workflow as text and fail if the link drifts again. No browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const readme = readFileSync(ROOT + "README.md", "utf8");
const pages = readFileSync(ROOT + ".github/workflows/pages.yml", "utf8");
const dashboard = readFileSync(ROOT + "web/index.html", "utf8");
const dashboardBuilder = readFileSync(ROOT + "scripts/build_dashboard.py", "utf8");
const snake = readFileSync(ROOT + "web/snake.html", "utf8");
const refreshWorkflow = readFileSync(ROOT + ".github/workflows/3d-contrib.yml", "utf8");

/** The Pages site the workflow publishes to, without a trailing slash. */
const SITE = "https://knarayanareddy.github.io/knarayanareddy";
/** Hosts that have never served the interactive pages. */
const DEAD_HOSTS = ["kiranreddy.nl/dashboards", "kiranreddy.nl/snake"];

function block(text, name) {
  const start = text.indexOf(`<!-- ${name}:START -->`);
  const end = text.indexOf(`<!-- ${name}:END -->`);
  assert.ok(start !== -1 && end !== -1, `missing ${name} marker block`);
  return text.slice(start, end);
}

test("README never links the pages at a host that does not serve them", () => {
  for (const host of DEAD_HOSTS) {
    assert.ok(
      !readme.includes(host),
      `README still links ${host}; the interactive pages are served from ${SITE}`,
    );
  }
});

test("the interactive block exists and links the dashboard, snake and reel", () => {
  const text = block(readme, "INTERACTIVE");
  assert.ok(text.includes(`href="${SITE}/"`), "dashboard link missing or wrong host");
  assert.ok(text.includes(`href="${SITE}/snake.html"`), "snake link missing or wrong host");
  assert.ok(text.includes(`href="${SITE}/reel.html"`), "reel link missing or wrong host");
});

test("every page the interactive block links is actually published", () => {
  const text = block(readme, "INTERACTIVE");
  const linked = [...text.matchAll(new RegExp(`href="${SITE}/([^"]*)"`, "g"))];
  assert.ok(linked.length >= 3, "expected dashboard, snake and reel links");
  for (const [, path] of linked) {
    const file = path === "" || path.endsWith("/") ? "index.html" : path;
    assert.ok(existsSync(ROOT + "web/" + file), `README links ${file}, but web/${file} does not exist`);
  }
});

test("the snake caption points at the published page", () => {
  assert.ok(
    readme.includes(`](${SITE}/snake.html)`),
    `the "Play it yourself" link must point at ${SITE}/snake.html`,
  );
});

test("the README dashboard snapshot links directly to its live canvas", () => {
  const section = readme.slice(readme.indexOf("## Signal Dashboard"), readme.indexOf("### 🏔️ A year"));
  assert.match(section, new RegExp(`<a href="${SITE}/">\\s*<picture>`));
  assert.match(section, /Click the card for the interactive canvas/);
});

test("the live dashboard refreshes safely from timestamped real data", () => {
  assert.match(dashboardBuilder, /"generated_at": updated_at\.isoformat\(\)/);
  assert.match(dashboardBuilder, /%Y-%m-%d %H:%M UTC/);
  assert.match(dashboard, /generated_at/);
  assert.match(dashboard, /setInterval\([\s\S]*?5 \* 60 \* 1000/);
  assert.match(dashboard, /visibilitychange/);
  assert.match(dashboard, /data as of|data \$\{stamp\}|updated \$\{stamp\}/);
  assert.match(dashboard, /14 repositories over 120 days/);
  assert.match(refreshWorkflow, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(refreshWorkflow, /best-effort/);
  assert.match(refreshWorkflow, /git add assets\/dashboard-\*\.svg assets\/terrain-\*\.svg data\/stats\.json/);
});

test("published and local pages resolve stats and theme JSON from the right data directory", () => {
  for (const page of [dashboard, snake]) {
    assert.match(page, /location\.protocol === "file:"/);
    assert.match(page, /location\.pathname\.includes\("\/web\/"\)/);
    assert.match(page, /"\.\/data\/"/);
    assert.match(page, /"\.\.\/data\/"/);
  }
  assert.match(pages, /cp data\/\*\.json _site\/data\//);
});

test("Pages publishes the pages and the data they fetch", () => {
  assert.match(pages, /cp -r web\/\*\s+_site\//, "web/* must land at the site root");
  assert.match(pages, /_site\/data/, "the JSON the pages fetch must be published under /data/");
  assert.match(pages, /tokens\.json/, "tokens.json drives the palette; it must be published");
});

test("Pages fails loudly when a required artefact is missing", () => {
  assert.match(pages, /::error::/, "a missing file should surface as an error annotation");
  for (const needed of ["index.html", "snake.html", "reel.html", "data/stats.json", "data/tokens.json"]) {
    assert.ok(pages.includes(needed), `the publish guard does not check _site/${needed}`);
  }
});
