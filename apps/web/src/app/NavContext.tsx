import { createContext, useContext } from "react";

/**
 * Contexte de navigation inter-sections.
 * Permet à une page (ex. ProjectsAdminPage) de demander au shell
 * (AdminHomePage) de basculer vers une autre section, en lui passant
 * optionnellement des paramètres éphémères (ex. projectId à ouvrir).
 *
 * Cycle de vie des params : la page cible doit appeler consumeParams()
 * une seule fois au montage pour éviter toute fuite d'état.
 */
export interface NavContextValue {
  goToSection: (sectionKey: string, params?: Record<string, string>) => void;
  consumeParams: () => Record<string, string> | null;
}

export const NavContext = createContext<NavContextValue>({
  goToSection: () => {},
  consumeParams: () => null,
});

export const useNav = () => useContext(NavContext);