import hero160 from '../assets/quack-honk-pdf-hero-160.webp?no-inline';
import hero256 from '../assets/quack-honk-pdf-hero-256.webp?no-inline';
import hero384 from '../assets/quack-honk-pdf-hero-384.webp?no-inline';
import hero512 from '../assets/quack-honk-pdf-hero-512.webp?no-inline';

type State = 'empty' | 'working' | 'warning' | 'error' | 'success';
const files: Record<State, string> = {
  empty: 'quack-honk-pdf-hero.webp',
  working: 'quack-working.webp',
  warning: 'honk-worried-warning.webp',
  error: 'honk-error.webp',
  success: 'honk-happy.webp',
};

const heroSrc = `${import.meta.env.BASE_URL}mascots/${files.empty}`;

export function MascotState({ state, alt }: { state: State; alt: string }) {
  if (state === 'empty') {
    return <img className="mascot mascot-welcome" src={heroSrc} alt={alt} width={640} height={320}
      srcSet={`${hero160} 160w, ${hero256} 256w, ${hero384} 384w, ${hero512} 512w, ${heroSrc} 640w`}
      sizes="(max-width: 360px) 110px, (max-width: 440px) 135px, (max-width: 720px) 180px, 250px" />;
  }
  return <img className="mascot" src={`${import.meta.env.BASE_URL}mascots/${files[state]}`} alt={alt} />;
}
