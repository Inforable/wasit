const FACTS=/\b(?:brand|model|inverter|capacity|horsepower|btu|pk|floor|access|stairs?|elevator|lift|photos?|pictures?|serial|budget|spending limit|maximum spend|merek|merk|tipe|kapasitas|lantai|akses|tangga|foto|gambar|nomor seri|anggaran)\b/i;
const ASK=/\?|^(?:what|which|how|is your|are your|does your|apa|berapa|apakah)\b|\b(?:please|kindly|could you|can you|would you|tolong|mohon)\b.*\b(?:confirm|provide|share|send|tell|show|clarify|kirim|sebut|konfirmasi|berikan|infokan)\b/i;
const OFFER=/\b(?:price|quote|offer|rate|total|harga|penawaran)\b[^?]*\b(?:work|okay|ok|acceptable|suit|agree|cocok|setuju)\b|\b(?:accept|setuju)\b[^?]*(?:\brp\b|price|offer|quote|harga)/i;

/** Only explicit requests for customer-only facts pause an automatic conversation. */
export function providerQuestion(text) {
  if(typeof text!=='string')return null;
  for(const sentence of text.split(/(?<=[.!?])\s+|\n/)){
    const raw=sentence.trim();
    if(raw&&FACTS.test(raw)&&ASK.test(raw)&&!OFFER.test(raw))return raw;
  }
  return null;
}
