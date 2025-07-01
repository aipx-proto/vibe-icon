// Simple progress bar function
export function updateProgress(current: number, total: number, stage: string, errors: number = 0) {
  const percentage = Math.round((current / total) * 100);
  const barLength = 30;
  const filledLength = Math.round((barLength * current) / total);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  
  const errorText = errors > 0 ? ` | ${errors} errors` : '';
  process.stdout.write(`\r${stage}: [${bar}] ${percentage}% (${current}/${total})${errorText}`);
  if (current === total) {
    process.stdout.write('\n');
  }
}

// Simple spinner for indefinite progress

export function progressSpinner(stage: string) {
  let spinnerInterval: NodeJS.Timeout | null = null;
  let spinnerIndex = 0;
  const spinnerFrames = ['|', '/', '-', '\\'];
  
  spinnerIndex = 0;
  process.stdout.write(`${stage}: ${spinnerFrames[spinnerIndex]}`);
  spinnerInterval = setInterval(() => {
    spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
    process.stdout.write(`\r${stage}: ${spinnerFrames[spinnerIndex]}`);
  }, 100);
  
  return function stopSpinner() {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
      process.stdout.write(`\r${stage ? stage + ': ' : ''}Done\n`);
    }
  }
}

