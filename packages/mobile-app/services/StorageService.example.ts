import StorageService from './StorageService';

async function example() {
  try {
    // Store a note
    await StorageService.set('/goals/learn-guitar', 
      'Started to learn guitar on 2024-11-15, has taken lessons from a teacher, working on learning hand placement'
    );

    // Store another note
    await StorageService.set('/goals/learn-spanish', 
      'Started Spanish lessons on Duolingo, completed first 3 chapters'
    );

    // Get a specific note
    const guitarNote = await StorageService.get('/goals/learn-guitar');
    console.log('Guitar note:', guitarNote);

    // List all keys
    const allKeys = await StorageService.listKeys();
    console.log('All keys:', allKeys);
    // Output: ['/goals/learn-guitar', '/goals/learn-spanish']

    // Delete a note
    await StorageService.delete('/goals/learn-spanish');

    // List keys again to confirm deletion
    const remainingKeys = await StorageService.listKeys();
    console.log('Remaining keys:', remainingKeys);
    // Output: ['/goals/learn-guitar']

  } catch (error) {
    console.error('Error in storage example:', error);
  }
}

// Run the example
example();
