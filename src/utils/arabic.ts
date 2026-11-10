/**
 * Utilities for Arabic text, Egyptian currency, dates, and phone number validation
 */

// Convert Eastern Arabic/Hindi digits to Western Latin digits
export function toLatinDigits(str: string): string {
  if (!str) return '';
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[٠-٩]/g, (w) => arabicDigits.indexOf(w).toString());
}

// Clean and standardize Egyptian mobile phone numbers
export function cleanEgyptianPhone(phone: string): { isValid: boolean; cleaned: string; error?: string } {
  if (!phone) {
    return { isValid: false, cleaned: '', error: 'رقم الهاتف مطلوب' };
  }

  let cleaned = toLatinDigits(phone.toString()).trim();
  // Remove non-digit characters except leading plus
  cleaned = cleaned.replace(/[\s\-\(\)\.]/g, '');

  // Handle +20 or 0020 prefixes
  if (cleaned.startsWith('+20')) {
    cleaned = '0' + cleaned.substring(3);
  } else if (cleaned.startsWith('0020')) {
    cleaned = '0' + cleaned.substring(4);
  } else if (cleaned.startsWith('20') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  }

  // Handle Excel dropping leading 0: 10 digits starting with 1 (e.g. 1012345678)
  if (cleaned.length === 10 && (cleaned.startsWith('10') || cleaned.startsWith('11') || cleaned.startsWith('12') || cleaned.startsWith('15'))) {
    cleaned = '0' + cleaned;
  }

  // Validate: must be 11 digits starting with 010, 011, 012, or 015
  const regex = /^01[0125][0-9]{8}$/;
  if (!regex.test(cleaned)) {
    return {
      isValid: false,
      cleaned,
      error: 'رقم الهاتف يجب أن يكون محمول مصري مكون من 11 خانة يبدأ بـ 010 أو 011 أو 012 أو 015'
    };
  }

  return { isValid: true, cleaned };
}

// Format currency in Egyptian Pounds (ج.م)
export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount || 0);
  return `${formatted} ج.م`;
}

// Tafqeet - Convert number to Arabic text words for receipts
export function tafqeet(num: number): string {
  if (num === 0) return 'صفر جنيه مصري فقط لا غير';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];

  function convertGroup(n: number): string {
    let result = '';
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    const t = Math.floor(remainder / 10);
    const o = remainder % 10;

    if (h > 0) {
      result += hundreds[h];
    }

    if (remainder > 0) {
      if (result !== '') result += ' و';
      if (remainder >= 10 && remainder <= 19) {
        result += teens[remainder - 10];
      } else {
        if (o > 0) {
          result += ones[o];
          if (t > 0) result += ' و';
        }
        if (t > 0) {
          result += tens[t];
        }
      }
    }
    return result;
  }

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  let parts: string[] = [];
  const thousands = Math.floor((integerPart % 1000000) / 1000);
  const units = integerPart % 1000;
  const millions = Math.floor(integerPart / 1000000);

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(convertGroup(millions) + ' ملايين');
    else parts.push(convertGroup(millions) + ' مليون');
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(convertGroup(thousands) + ' آلاف');
    else parts.push(convertGroup(thousands) + ' ألف');
  }

  if (units > 0) {
    parts.push(convertGroup(units));
  }

  let text = parts.join(' و');
  if (!text) text = 'صفر';

  let currencyName = 'جنيه مصري';
  if (integerPart >= 3 && integerPart <= 10) {
    currencyName = 'جنيهات مصرية';
  }

  let fullText = `${text} ${currencyName}`;

  if (decimalPart > 0) {
    fullText += ` و${convertGroup(decimalPart)} قرشاً`;
  }

  return `${fullText} فقط لا غير`;
}

// Arabic day names starting from Saturday
export const ARABIC_DAYS = [
  'السبت',
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
];

// Arabic month names
export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

// Format date to Arabic (Cairo format: "9 نوفمبر 2026")
export function formatArabicDate(dateStr: string | Date): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return String(dateStr);
  const day = d.getDate();
  const monthName = ARABIC_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${monthName} ${year}`;
}

// Format time (e.g. "09:30" to "09:30 ص" or "04:15 م")
export function formatArabicTime(timeStr: string): string {
  if (!timeStr) return '';
  const [hourStr, minStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? 'م' : 'ص';
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${hour.toString().padStart(2, '0')}:${minStr || '00'} ${period}`;
}

// Today date string in YYYY-MM-DD
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Normalize Grade names during Excel import
export function normalizeGradeName(input: string, allowedGrades: string[]): string | null {
  if (!input) return null;
  const clean = input.trim().replace(/\s+/g, ' ');

  // Exact match
  const exact = allowedGrades.find(g => g === clean);
  if (exact) return exact;

  // Normalized comparisons
  const lowerClean = clean.toLowerCase();
  for (const grade of allowedGrades) {
    if (grade.includes(lowerClean) || lowerClean.includes(grade)) {
      return grade;
    }
  }

  // Common synonyms
  if (/أولى ابتدائي|اولى ابتدائي|1 ابتدائي/i.test(clean)) return 'الصف الأول الابتدائي';
  if (/ثانية ابتدائي|تانية ابتدائي|2 ابتدائي/i.test(clean)) return 'الصف الثاني الابتدائي';
  if (/ثالثة ابتدائي|تالتة ابتدائي|3 ابتدائي/i.test(clean)) return 'الصف الثالث الابتدائي';
  if (/رابعة ابتدائي|4 ابتدائي/i.test(clean)) return 'الصف الرابع الابتدائي';
  if (/خامسة ابتدائي|5 ابتدائي/i.test(clean)) return 'الصف الخامس الابتدائي';
  if (/سادسة ابتدائي|6 ابتدائي/i.test(clean)) return 'الصف السادس الابتدائي';
  if (/أولى إعدادي|اولى اعدادي|1 اعدادي/i.test(clean)) return 'الصف الأول الإعدادي';
  if (/ثانية إعدادي|تانية اعدادي|2 اعدادي/i.test(clean)) return 'الصف الثاني الإعدادي';
  if (/ثالثة إعدادي|تالتة اعدادي|3 اعدادي/i.test(clean)) return 'الصف الثالث الإعدادي';
  if (/أولى ثانوي|اولى ثانوي|1 ثانوي/i.test(clean)) return 'الصف الأول الثانوي';
  if (/ثانية ثانوي|تانية ثانوي|2 ثانوي/i.test(clean)) return 'الصف الثاني الثانوي';
  if (/ثالثة ثانوي|تالتة ثانوي|3 ثانوي/i.test(clean)) return 'الصف الثالث الثانوي';
  if (/كي جي 1|kg1|روضة 1/i.test(clean)) return 'رياض الأطفال 1';
  if (/كي جي 2|kg2|روضة 2/i.test(clean)) return 'رياض الأطفال 2';

  return null;
}
