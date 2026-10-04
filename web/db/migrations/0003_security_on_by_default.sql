-- Security findings are on by default. Rows still on the old default get security added.
alter table review_configs alter column comment_types set default '{logic,syntax,style,security}';
update review_configs set comment_types = comment_types || '{security}'
  where comment_types @> '{logic,syntax,style}' and not comment_types @> '{security}';
