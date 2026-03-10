export const metadata = {
  title: 'Transaction Cleaner',
  description: 'Clean and format crypto transaction exports',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
