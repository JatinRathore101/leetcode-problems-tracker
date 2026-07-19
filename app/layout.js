import "./globals.css";

export const metadata = {
  title: "LeetCode Problems Explorer",
  description: "Browse, search, and sort LeetCode problems by popularity, difficulty, and topic.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
