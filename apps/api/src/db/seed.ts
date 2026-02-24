import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(process.cwd(), '.env') });
config({ path: path.resolve(process.cwd(), '../../.env') });
import 'reflect-metadata';
import { initDb, dataSource } from './index';
import { Category } from '../entities/Category';
import categoriesData from '../categorizer/categories.json';

type CatInput = {
  id: string;
  name: string;
  keywords?: string[];
};

async function seed() {
  await initDb();
  const repo = dataSource.getRepository(Category);

  for (const cat of categoriesData.categories as CatInput[]) {
    await repo.upsert(
      {
        id: cat.id,
        name: cat.name,
        keywords: cat.keywords,
      },
      ['id'],
    );
  }

  console.log('Categories seeded.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
