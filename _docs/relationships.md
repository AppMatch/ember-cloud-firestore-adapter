---
layout: doc
title: Relationships
category: Essentials
order: 3
cenchat:
  id: docs
  text: Get help
---

The adapter supports `hasMany` and `belongsTo`. However, there are some **optional** configs that you can make use of to support your needs.

## belongsTo

The optional configs are available by passing it as a param.

```javascript
import { belongsTo } from 'ember-data/relationships';
import Model from 'ember-data/model';
import attr from 'ember-data/attr';

export default Model.extend({
  name: attr('string'),
  country: belongsTo('country', {
    isRealtime: true
  })
});
```

### isRealtime

Indicates if the record will update in realtime after creating it

**Type:** `boolean`

## hasMany

The optional configs are available by passing it as a param.

```javascript
import { hasMany } from 'ember-data/relationships';
import Model from 'ember-data/model';
import attr from 'ember-data/attr';

export default Model.extend({
  name: attr('string'),
  approvedPosts: hasMany('post', {
    isRealtime: true,

    filter(reference) {
      return reference.where('status', '==', 'approved');
    }
  })
});
```

If the document contains a field that matches your [`referenceKeyName`](02-configuration.md#settings), it will fetch that one instead.

### isRealtime

Indicates if the record will update in realtime after creating it

**Type:** `boolean`

### buildReference

Hook for providing a custom collection reference.

This is ignored when the relationship is a many-to-one type.

**Type:** `function`

**Params:**

| Name   | Type                                                                                                         | Description       |
| -------| ------------------------------------------------------------------------------------------------------------ | ----------------- |
| db     | [`firebase.firestore.Firestore`](https://firebase.google.com/docs/reference/js/firebase.firestore.Firestore) |                   |

### filter

Hook for providing the query for the collection reference

**Type:** `function`

**Params:**

| Name      | Type                                                                                                                             | Description                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| reference | [`firebase.firestore.CollectionReference`](https://firebase.google.com/docs/reference/js/firebase.firestore.CollectionReference) | Will contain the return of `buildReference` when overriden. Otherwise, it will be provided by the adapter itself. |
| record    | Object                                                                                                                           | The record itself                                                                                               |

---

[Next: Transforms »](transforms)
