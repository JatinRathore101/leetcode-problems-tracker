import "./globals.css";
import Sidebar from "./Sidebar.js";

export const metadata = {
  title: "LeetCode Problems Explorer",
  description: "Browse, search, and sort LeetCode problems by popularity, difficulty, and topic.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
