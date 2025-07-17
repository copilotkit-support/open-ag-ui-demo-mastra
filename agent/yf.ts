import yahooFinance from 'yahoo-finance2';

async function main() {
  const quote = await yahooFinance.quote('AAPL');
  console.log(quote);
}


main();