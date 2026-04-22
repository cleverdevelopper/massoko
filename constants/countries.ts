export interface Country {
  name: string;
  localName: string;
  code: string;
  flag: string;
  pattern: string; // Dynamic placeholder and mask (e.g. "00 000 0000")
}

export const COUNTRIES: Country[] = [
  { name: 'Moçambique', localName: 'Moçambique', code: '+258', flag: '🇲🇿', pattern: '00 000 0000' },
  { name: 'Brasil', localName: 'Brasil', code: '+55', flag: '🇧🇷', pattern: '00 00000 0000' },
  { name: 'Angola', localName: 'Angola', code: '+244', flag: '🇦🇴', pattern: '000 000 000' },
  { name: 'Portugal', localName: 'Portugal', code: '+351', flag: '🇵🇹', pattern: '000 000 000' },
  { name: 'África do Sul', localName: 'South Africa', code: '+27', flag: '🇿🇦', pattern: '00 000 0000' },
  { name: 'Tailândia', localName: 'ไทย', code: '+66', flag: '🇹🇭', pattern: '00 000 0000' },
  { name: 'Emirados Árabes Unidos', localName: 'دولة الإمارات العربية المتحدة', code: '+971', flag: '🇦🇪', pattern: '0 000 0000' },
  { name: 'Arábia Saudita', localName: 'المملكة العربية السعودية', code: '+966', flag: '🇸🇦', pattern: '00 000 0000' },
  { name: 'Estados Unidos', localName: 'United States', code: '+1', flag: '🇺🇸', pattern: '000 000 0000' },
  { name: 'Rússia', localName: 'Россия', code: '+7', flag: '🇷🇺', pattern: '000 000 0000' },
  { name: 'Alemanha', localName: 'Deutschland', code: '+49', flag: '🇩🇪', pattern: '000 0000000' },
  { name: 'França', localName: 'France', code: '+33', flag: '🇫🇷', pattern: '0 00 00 00 00' },
  { name: 'China', localName: '中国', code: '+86', flag: '🇨🇳', pattern: '000 0000 0000' },
  { name: 'Índia', localName: 'भारत', code: '+91', flag: '🇮🇳', pattern: '00000 00000' },
  { name: 'Japão', localName: '日本', code: '+81', flag: '🇯🇵', pattern: '00 0000 0000' },
];
