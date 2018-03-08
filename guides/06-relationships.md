# Relationships

## `hasMany`

### Using Filters

Using `filter()` is a great way to control your `hasMany` relationships.

```javascript
// Group model
import { hasMany } from 'ember-data/relationships';
import Model from 'ember-data/model';
import attr from 'ember-data/attr';

export default Model.extend({
  name: attr('string'),
  posts: hasMany('post', {
    // Use the record variable to access model props (e.g. record.get('name'))
    filter(reference, record) {
      return reference.limit(5);
    }
  })
});
```

#### Change Filters During Runtime

This is how you can change the `filter()` and reload the relationship once it's been set

```javascript
this.get('store').findRecord('group', 'group_a').then((group) => {
  group.get('posts').then((posts) => {
    posts.relationship.relationshipMeta.options.filter = (reference, record) => {
      return reference.limit(10);
    };
    posts.reload();
  });
});
```

> Notes:
>
> - This is useful for cases such as infinite scrolling.
> - I'm not sure if my example above is a public API in Ember Data. There may be a chance that this example won't work in the future.

---

[Next: Testing »](https://github.com/rmmmp/ember-cloud-firestore-adapter/blob/master/guides/07-testing.md)
