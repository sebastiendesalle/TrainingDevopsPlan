// The page title and nav stay pinned while scrolling (position: sticky in
// style.css). This marks the bar once content slides under it and tells
// anchor jumps how tall it is, so they don't land underneath it.

const bar = document.querySelector<HTMLElement>(".page-top");

if (bar) {
  const root = document.documentElement;
  const measure = () => root.style.setProperty("--top-h", `${bar.offsetHeight}px`);
  const mark = () => bar.classList.toggle("is-stuck", window.scrollY > 4);

  measure();
  mark();
  window.addEventListener("resize", measure);
  window.addEventListener("scroll", mark, { passive: true });
}
