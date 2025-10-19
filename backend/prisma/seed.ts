/**
 * Database Seed - Test Data
 * Creates sample novelas for testing the agent system
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test novela
  const testNovela = await prisma.novela.upsert({
    where: { id: 'test-novela-1' },
    update: {},
    create: {
      id: 'test-novela-1',
      title: 'Amor em Tempos Modernos',
      description: 'Uma novela romântica contemporânea sobre dois profissionais que se encontram em uma cafeteria e descobrem que são concorrentes de negócios.',
      genre: 'Romantic Drama',
      targetEpisodes: 120,
      createdVideos: 0,
      totalCost: 0,
      estimatedCost: 1200.00,
      defaultModelId: 'minimax-video-01',
      defaultDuration: 8,
      defaultResolution: '1080p',
      defaultAspectRatio: '16:9',
      referenceCharacterImages: {
        Maria: 'Beautiful 30-year-old woman, elegant business attire, confident expression',
        João: 'Handsome 35-year-old man, business suit, mysterious smile'
      },
      masterSeed: 42,
      status: 'planning',
    },
  });

  console.log('✅ Created test novela:', testNovela.id);

  // Create another test novela
  const testNovela2 = await prisma.novela.upsert({
    where: { id: 'test-novela-2' },
    update: {},
    create: {
      id: 'test-novela-2',
      title: 'Segredos do Passado',
      description: 'Um mistério envolvente sobre uma família que descobre segredos enterrados há décadas.',
      genre: 'Mystery Drama',
      targetEpisodes: 80,
      createdVideos: 0,
      totalCost: 0,
      estimatedCost: 800.00,
      defaultModelId: 'luma-ray',
      defaultDuration: 8,
      defaultResolution: '1080p',
      defaultAspectRatio: '16:9',
      status: 'planning',
    },
  });

  console.log('✅ Created test novela:', testNovela2.id);

  console.log('\n✅ Seeding complete!');
  console.log('📊 Database now has:');
  console.log(`  - ${2} test novelas`);
  console.log(`  - Ready for agent testing`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
