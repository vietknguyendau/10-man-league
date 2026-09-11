import './globals.css';

export const metadata = {
  title: '10 Man League',
  description: 'Draft board, weekly results, and standings for the 10 Man League',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
