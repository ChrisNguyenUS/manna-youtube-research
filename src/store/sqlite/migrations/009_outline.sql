-- The outline of an idea card and the script the owner pasted, beside the card's JSON so the card's own cleaning
-- never touches them (core/outline/outline.js).
ALTER TABLE ideas ADD COLUMN outline TEXT;
ALTER TABLE ideas ADD COLUMN script TEXT NOT NULL DEFAULT '';
