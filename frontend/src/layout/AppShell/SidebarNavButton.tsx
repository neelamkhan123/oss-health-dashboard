import { useLocation, useNavigate } from "react-router-dom";
import { SidebarMenuButton } from "neelam-ui";
import type { MouseEvent, ReactNode } from "react";

// SidebarMenuButton always renders a real <a href>, so it can't be nested
// inside react-router's <NavLink> (which renders its own <a>) — that
// produces an invalid <a> inside <a> and a hydration error. Instead, compute
// active state from the current location and drive navigation from
// onClick, the same way any real anchor integrates with client-side routing.
export function SidebarNavButton({
  to,
  icon,
  className,
  children,
}: {
  to: string;
  icon: ReactNode;
  /** Merged onto the underlying anchor — the repo entries use it to
   *  reserve room for their own hover-revealed actions button. */
  className?: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === to;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return; // let the browser handle new-tab/new-window clicks normally
    }
    e.preventDefault();
    navigate(to);
  };

  return (
    <SidebarMenuButton
      href={to}
      icon={icon}
      isActive={isActive}
      className={className}
      onClick={handleClick}
    >
      {children}
    </SidebarMenuButton>
  );
}
