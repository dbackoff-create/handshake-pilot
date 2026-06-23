import "./globals.css";
import { AuthProvider } from "@/lib/useAuth";
import NavBar from "./NavBar";

export const metadata = {
  title: "Handshake",
  description: "The Game Scheduler for Travel Baseball",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NavBar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
