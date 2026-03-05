import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLinkIcon } from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { create } from "zustand";

// THADM-HIDDEN: cloud login dialog — uncomment when own auth backend is available
export function LoginDialog() {
  return null;
}

interface LoginDialogState {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  checkLogin: (user: any | null, showDialog?: boolean) => boolean;
}

export const useLoginDialog = create<LoginDialogState>((set) => ({
  isOpen: false,
  setIsOpen: (open) => set({ isOpen: open }),
  checkLogin: (user, showDialog = true) => {
    if (!user?.token) {
      if (showDialog) {
        set({ isOpen: true });
      }
      return false;
    }
    return true;
  },
}));
