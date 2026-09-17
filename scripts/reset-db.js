#!/usr/bin/env node
// Database reset script

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function resetDatabase() {
  console.log('Resetting database...');
  
  try {
    // Delete the SQLite database file if it exists
    const dbPath = path.join(__dirname, '..', 'mia.db');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('Deleted existing database');
    }
    
    // Delete all migration files
    const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(migrationsDir, file));
      });
      console.log('Cleared migrations directory');
    }
    
    console.log('Database reset complete. Run the app to reinitialize.');
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  }
}

resetDatabase();