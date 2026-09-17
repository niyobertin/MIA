#!/usr/bin/env node
// Database seed script

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function seedDatabase() {
  console.log('Seeding database with demo data...');
  
  try {
    // This would be run within the app context
    // For now, just show instructions
    console.log('To seed the database, run the app and it will automatically seed demo data on first run.');
    console.log('The seed data includes:');
    console.log('  - Demo business: MIA Demo Shop');
    console.log('  - 4 categories: Beverages, Food, Household, Personal Care');
    console.log('  - 8 products with realistic RWF prices');
    console.log('  - 3 suppliers');
    console.log('  - 3 customers');
    console.log('  - Opening stock movements');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();