#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function run(command, options = {}) {
  console.log(`🔄 Running: ${command}`);
  try {
    return execSync(command, { 
      stdio: options.silent ? 'pipe' : 'inherit', 
      encoding: 'utf8',
      ...options 
    });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

function updateChangelogDate() {
  const changelogPath = path.join(__dirname, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    console.log('⚠️  CHANGELOG.md not found, skipping changelog update');
    return;
  }

  const content = fs.readFileSync(changelogPath, 'utf8');
  const today = new Date().toISOString().split('T')[0];
  
  // Replace any placeholder dates with today's date
  const updatedContent = content.replace(
    /\d{4}-\d{2}-XX|\d{4}-XX-XX|TBD|TODO/g, 
    today
  );
  
  if (content !== updatedContent) {
    fs.writeFileSync(changelogPath, updatedContent);
    console.log('✅ Updated CHANGELOG.md with current date');
  }
}

async function main() {
  try {
    console.log('🚀 Starting release process...\n');
    
    // Check if we have uncommitted changes
    const status = run('git status --porcelain', { silent: true });
    if (status.trim()) {
      console.log('📝 Found uncommitted changes. Committing them first...');
      const commitMessage = await ask('Enter commit message (or press Enter for "Prepare for release"): ');
      const message = commitMessage.trim() || 'Prepare for release';
      
      run('git add .');
      run(`git commit -m "${message}"`);
    }

    // Ask for release type
    console.log('\n📋 Select release type:');
    console.log('1. patch (0.0.8 → 0.0.9) - Bug fixes');
    console.log('2. minor (0.0.8 → 0.1.0) - New features');
    console.log('3. major (0.0.8 → 1.0.0) - Breaking changes');
    
    const choice = await ask('\nEnter choice (1-3): ');
    const releaseTypes = { '1': 'patch', '2': 'minor', '3': 'major' };
    const releaseType = releaseTypes[choice];
    
    if (!releaseType) {
      console.log('❌ Invalid choice. Exiting.');
      process.exit(1);
    }

    // Update changelog date
    updateChangelogDate();

    // Commit changelog updates if any
    const changelogStatus = run('git status --porcelain CHANGELOG.md', { silent: true });
    if (changelogStatus.trim()) {
      run('git add CHANGELOG.md');
      run('git commit -m "Update CHANGELOG.md for release"');
    }

    // Get current version for confirmation
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = packageJson.version;
    
    console.log(`\n📦 Current version: ${currentVersion}`);
    console.log(`🎯 Release type: ${releaseType}`);
    
    const confirm = await ask('\nProceed with release? (y/N): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('❌ Release cancelled.');
      process.exit(0);
    }

    // Check if .env exists and has VSCE_PAT
    if (!fs.existsSync('.env')) {
      console.log('❌ .env file not found. Please create it with your VSCE_PAT.');
      process.exit(1);
    }

    // Load environment variables
    require('dotenv').config();
    if (!process.env.VSCE_PAT) {
      console.log('❌ VSCE_PAT not found in .env file.');
      process.exit(1);
    }

    // Publish with version bump
    console.log(`\n🚀 Publishing ${releaseType} release...`);
    run(`vsce publish ${releaseType}`, { 
      env: { ...process.env, VSCE_PAT: process.env.VSCE_PAT } 
    });

    // Push to git with tags
    console.log('\n📤 Pushing to git with tags...');
    run('git push origin main --tags');

    // Get new version
    const newPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const newVersion = newPackageJson.version;

    console.log('\n🎉 Release complete!');
    console.log(`✅ Version: ${currentVersion} → ${newVersion}`);
    console.log(`🔗 Marketplace: https://marketplace.visualstudio.com/items?itemName=joaojanini.fileprompt`);
    console.log(`📊 Hub: https://marketplace.visualstudio.com/manage/publishers/joaojanini/extensions/fileprompt/hub`);

  } catch (error) {
    console.error('❌ Release failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main(); 