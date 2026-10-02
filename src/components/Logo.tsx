import logo from '../assets/ananas-logo.png';
import logoLight from '../assets/ananas-logo-light.png';

/**
 * Both assets have transparent backgrounds and are cropped tight to the
 * artwork, so the height you pass is all logo rather than mostly padding.
 *
 * Pass `onDark` anywhere the background is the deep green (admin sidebar,
 * spectator screen): the default artwork's wordmark is dark green and would
 * otherwise disappear into it now that there's no white box behind it.
 */
export function Logo({ height = 44, onDark = false }: { height?: number; onDark?: boolean }) {
  return (
    <img
      src={onDark ? logoLight : logo}
      alt="Ananas"
      style={{ height, width: 'auto', display: 'block' }}
    />
  );
}
