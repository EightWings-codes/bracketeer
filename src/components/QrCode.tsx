import QRCode from "qrcode";

/**
 * Server-rendered inline SVG: no client JS, and it stays crisp when printed on
 * a poster. Always black on white — a dark-mode QR on a dark card won't scan.
 */
export default async function QrCode({ value, size = 140 }: { value: string; size?: number }) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  return (
    <div
      aria-label={`QR code for ${value}`}
      role="img"
      className="shrink-0 rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
