type State = 'empty' | 'working' | 'warning' | 'error' | 'success';
const files: Record<State, string> = {
  empty: 'quack-empty-state.webp',
  working: 'quack-working.webp',
  warning: 'honk-worried-warning.webp',
  error: 'honk-error.webp',
  success: 'honk-happy.webp',
};
export function MascotState({ state, alt }: { state: State; alt: string }) {
  return <img className="mascot" src={`${import.meta.env.BASE_URL}mascots/${files[state]}`} alt={alt} />;
}
