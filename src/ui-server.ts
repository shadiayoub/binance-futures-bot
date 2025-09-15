// UI Server - starts both the web server and the trading bot
import './server'; // This starts the Express server
import './multi-pair-index'; // This starts the trading bot

console.log('🚀 Starting ADA Futures Trading Bot with UI Dashboard...');
console.log('📊 Dashboard will be available at: http://localhost:3000');
console.log('🤖 Trading bot will start automatically');
console.log('Press Ctrl+C to stop both services');