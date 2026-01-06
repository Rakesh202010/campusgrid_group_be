// Migration to add ID card styling columns
import pg from 'pg';

const alterTableSQL = `
-- Add portrait layout and styling columns to id_card_templates
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS portrait_layout VARCHAR(20) DEFAULT 'photo-top';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS name_font_size INTEGER DEFAULT 12;
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS name_font_weight VARCHAR(20) DEFAULT 'bold';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS name_text_color VARCHAR(7) DEFAULT '#000000';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS name_alignment VARCHAR(20) DEFAULT 'left';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS info_font_size INTEGER DEFAULT 9;
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS label_font_weight VARCHAR(20) DEFAULT 'bold';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS label_text_color VARCHAR(7) DEFAULT '#666666';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS value_font_weight VARCHAR(20) DEFAULT 'normal';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS value_text_color VARCHAR(7) DEFAULT '#000000';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS show_labels BOOLEAN DEFAULT TRUE;
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS info_alignment VARCHAR(20) DEFAULT 'left';
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS show_father_name BOOLEAN DEFAULT TRUE;
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS show_mother_name BOOLEAN DEFAULT FALSE;
ALTER TABLE id_card_templates ADD COLUMN IF NOT EXISTS show_contact_number BOOLEAN DEFAULT TRUE;
`;

async function runMigration() {
  const adminClient = new pg.Client({
    host: process.env.ADMIN_DB_HOST || 'localhost',
    port: process.env.ADMIN_DB_PORT || 5433,
    database: process.env.ADMIN_DB_NAME || 'campusgrid_admin',
    user: process.env.ADMIN_DB_USER || 'admin',
    password: process.env.ADMIN_DB_PASSWORD || 'admin123',
  });

  try {
    await adminClient.connect();
    console.log('Connected to admin database');

    // Get all school groups
    const groupsResult = await adminClient.query('SELECT * FROM school_groups WHERE is_active = true');
    console.log(`Found ${groupsResult.rows.length} active school groups`);

    for (const group of groupsResult.rows) {
      const dbName = `campusgrid_group_${group.id.replace(/-/g, '_')}`;
      console.log(`\nProcessing database: ${dbName}`);

      const groupClient = new pg.Client({
        host: process.env.SCHOOLS_DB_HOST || 'localhost',
        port: process.env.SCHOOLS_DB_PORT || 5434,
        database: dbName,
        user: process.env.SCHOOLS_DB_USER || 'school_admin',
        password: process.env.SCHOOLS_DB_PASSWORD || 'school123',
      });

      try {
        await groupClient.connect();
        
        // Check if table exists
        const tableCheck = await groupClient.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'id_card_templates'
          )
        `);
        
        if (!tableCheck.rows[0].exists) {
          console.log(`  - Table id_card_templates does not exist, skipping...`);
          continue;
        }
        
        // Run the ALTER TABLE statements
        await groupClient.query(alterTableSQL);
        console.log(`  ✓ Added new columns to id_card_templates`);
        
      } catch (err) {
        console.error(`  ✗ Error processing ${dbName}:`, err.message);
      } finally {
        await groupClient.end();
      }
    }

    console.log('\n✓ Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await adminClient.end();
  }
}

runMigration();

