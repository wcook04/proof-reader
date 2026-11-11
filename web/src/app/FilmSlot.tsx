// A film's place on a page, in the family's markup (styles in styles/family.css).
// Adapted from lean-exposition site/src/app/FilmSlot.tsx at ed08df8, Copyright 2026
// lean-exposition contributors, Apache-2.0. The picture and the title open the same
// video, so the title is the one link in the Tab order.

import { clockTime, spokenTime, type Film } from "./films";

export function FilmSlot({ film, size = "small", text = true }: { film: Film; size?: "small" | "large" | "inline"; text?: boolean }) {
  return (
    <figure className={`film-slot film-slot--${size}`}>
      <a className="film-slot__frame" href={film.youtube} target="_blank" rel="noopener noreferrer" aria-hidden="true" tabIndex={-1}>
        <img src={film.still} alt="" width={960} height={540} decoding="async" />
        <span className="film-slot__play" />
        <span className="film-slot__time">{clockTime(film.seconds)}</span>
      </a>
      <figcaption className="film-slot__caption">
        <p className="film-slot__title">
          <a href={film.youtube} target="_blank" rel="noopener noreferrer">
            {film.title}
            <span className="sr-only">, video on YouTube, {spokenTime(film.seconds)}</span>
          </a>
        </p>
        {text && <p className="film-slot__text">{film.about}</p>}
      </figcaption>
    </figure>
  );
}
