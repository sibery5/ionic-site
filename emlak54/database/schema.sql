CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL DEFAULT 'Yönetici',
  role VARCHAR(24) NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS properties (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(190) NOT NULL UNIQUE,
  title VARCHAR(220) NOT NULL,
  deal VARCHAR(24) NOT NULL DEFAULT 'Satılık',
  category VARCHAR(60) NOT NULL DEFAULT 'Konut',
  kind VARCHAR(80) NOT NULL DEFAULT 'Daire',
  price DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'TRY',
  city VARCHAR(100) NOT NULL DEFAULT 'Sakarya',
  district VARCHAR(100) NOT NULL DEFAULT '',
  neighborhood VARCHAR(140) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  area INT UNSIGNED NOT NULL DEFAULT 0,
  rooms VARCHAR(30) NOT NULL DEFAULT '',
  baths TINYINT UNSIGNED NOT NULL DEFAULT 0,
  floor_info VARCHAR(40) NOT NULL DEFAULT '',
  building_age VARCHAR(40) NOT NULL DEFAULT '',
  heating VARCHAR(80) NOT NULL DEFAULT '',
  furnished TINYINT(1) NOT NULL DEFAULT 0,
  year_built SMALLINT UNSIGNED NOT NULL DEFAULT 2024,
  description TEXT NOT NULL,
  features_json JSON NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  badge VARCHAR(40) NOT NULL DEFAULT '',
  seo_title VARCHAR(255) NOT NULL DEFAULT '',
  seo_description VARCHAR(320) NOT NULL DEFAULT '',
  seo_keywords VARCHAR(500) NOT NULL DEFAULT '',
  meta_robots VARCHAR(50) NOT NULL DEFAULT 'index,follow',
  view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  INDEX idx_properties_status_created (status, created_at),
  INDEX idx_properties_deal_category (deal, category, status),
  INDEX idx_properties_location (city, district, neighborhood),
  INDEX idx_properties_price (price),
  FULLTEXT INDEX ft_properties_search (title, description, district, neighborhood, address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS property_images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT UNSIGNED NOT NULL,
  image_path VARCHAR(500) NOT NULL,
  alt_text VARCHAR(255) NOT NULL DEFAULT '',
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_cover TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_property_images_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  INDEX idx_property_images_sort (property_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS page_views (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  page_type VARCHAR(24) NOT NULL,
  page_key VARCHAR(220) NOT NULL DEFAULT '',
  property_id BIGINT UNSIGNED NULL,
  visitor_hash CHAR(64) NOT NULL DEFAULT '',
  user_agent_hash CHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_page_views_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  INDEX idx_page_views_created (created_at),
  INDEX idx_page_views_type_date (page_type, created_at),
  INDEX idx_page_views_property_date (property_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'warning',
  http_method VARCHAR(10) NOT NULL DEFAULT 'GET',
  request_path VARCHAR(255) NOT NULL DEFAULT '/',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  detail VARCHAR(600) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_ip_date (ip_address, created_at),
  INDEX idx_security_type_date (event_type, created_at),
  INDEX idx_security_severity_date (severity, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ip_bans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL UNIQUE,
  reason VARCHAR(255) NOT NULL DEFAULT 'Yönetici tarafından engellendi',
  banned_by BIGINT UNSIGNED NULL,
  banned_until DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ip_bans_admin FOREIGN KEY (banned_by) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_ip_bans_active_until (is_active, banned_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_actions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT UNSIGNED NULL,
  action_key VARCHAR(100) NOT NULL,
  object_type VARCHAR(80) NOT NULL DEFAULT '',
  object_id BIGINT UNSIGNED NULL,
  details_json JSON NULL,
  ip_address VARCHAR(45) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_actions_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_admin_actions_date (created_at),
  INDEX idx_admin_actions_action (action_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key VARCHAR(190) PRIMARY KEY,
  window_started_at DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rate_limits_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
