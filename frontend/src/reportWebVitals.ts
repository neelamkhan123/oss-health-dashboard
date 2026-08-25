import { onCLS, onINP, onLCP } from "web-vitals";

export function reportWebVitals() {
  onCLS(console.log);
  onINP(console.log);
  onLCP(console.log);
}
