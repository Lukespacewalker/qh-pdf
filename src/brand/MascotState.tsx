type State = 'empty' | 'working' | 'warning' | 'error' | 'success';
const files: Record<State, string> = {
  empty: 'quack-honk-pdf-hero.webp',
  working: 'quack-working.webp',
  warning: 'honk-worried-warning.webp',
  error: 'honk-error.webp',
  success: 'honk-happy.webp',
};
export function MascotState({ state, alt }: { state: State; alt: string }) {
  return <img className={`mascot${state === 'empty' ? ' mascot-welcome' : ''}`} src={`${import.meta.env.BASE_URL}mascots/${files[state]}`} alt={alt} />;
}
