"use client";
import { useEffect, useRef, useState } from "react";

// The hero's 3D film, rendered in Blender (source: /hero-src). It is a
// replaceable asset: swap the files in /public/hero, keep the names, and bump V.
//
// - Posters are real frames, so the hero is complete before, or without, video.
// - Desktop (>= 1024px) and mobile use different framings. Light and dark
//   themes each have a copy composited on the matching background colour.
// - Reduced motion, Save-Data or blocked autoplay: the final frame is shown
//   and no video is downloaded.
// - The film plays once, muted, and rests on its final frame.

const V = "2";
const DESKTOP = "(min-width: 1024px)";

function useTheme() {
  const [theme, setTheme] = useState(null);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.dataset.theme === "dark" ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

function useMedia(query) {
  const [match, setMatch] = useState(null);
  useEffect(() => {
    const mq = matchMedia(query);
    const read = () => setMatch(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);
  return match;
}

function Poster({ theme, frame }) {
  // <picture> downloads only the framing that fits; lazy + display:none keeps
  // the other theme's poster from loading at all
  return (
    <picture className={theme === "light" ? "dark:hidden" : "hidden dark:block"}>
      <source media={DESKTOP} srcSet={`/hero/desktop-${theme}-${frame}.webp?v=${V}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/hero/mobile-${theme}-${frame}.webp?v=${V}`} alt="" decoding="async" loading={theme === "light" ? "eager" : "lazy"}
        className="absolute inset-0 size-full object-cover" />
    </picture>
  );
}

export function HeroFilm({ className = "" }) {
  const theme = useTheme();
  const desktop = useMedia(DESKTOP);
  const reduce = useMedia("(prefers-reduced-motion: reduce)");
  const video = useRef(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [ended, setEnded] = useState(false);

  const saveData = typeof navigator !== "undefined" && navigator.connection?.saveData;
  const known = theme !== null && desktop !== null && reduce !== null;
  const still = known && (reduce || saveData || failed);
  const play = known && !still && !ended;
  const layout = desktop ? "desktop" : "mobile";

  useEffect(() => {
    const v = video.current;
    if (!play || !v) return;
    setReady(false);
    const p = v.play();
    if (p) p.catch(() => setFailed(true)); // autoplay refused: show the finished scene
  }, [play, layout, theme]);

  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <Poster theme="light" frame={still || ended ? "end" : "start"} />
      <Poster theme="dark" frame={still || ended ? "end" : "start"} />
      {known && !still && (
        <video ref={video} key={`${layout}-${theme}`} muted playsInline preload="auto" disablePictureInPicture disableRemotePlayback
          onPlaying={() => setReady(true)} onEnded={() => setEnded(true)} onError={() => setFailed(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}>
          <source src={`/hero/${layout}-${theme}.webm?v=${V}`} type='video/webm; codecs="vp9"' />
          <source src={`/hero/${layout}-${theme}.mp4?v=${V}`} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
