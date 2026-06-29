export function roundCurrency(rate:number) {
    const base = Math.floor(rate / 100) * 100;
    const rest = rate % 100;
  
    if (rest === 0) return rate;
  
    if (rest <= 50) {
      return base + 50;
    } else {
      return base + 100;
    }
  }
  