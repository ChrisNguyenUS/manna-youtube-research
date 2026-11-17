-- What happened to an idea card once posted (core/ideas/review.js): the link, snapshots of its numbers and the owner's
-- own counts. Beside the card's JSON, like the outline, so the card's cleaning never touches it.
ALTER TABLE ideas ADD COLUMN published TEXT;
