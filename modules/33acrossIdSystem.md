# 33ACROSS ID

For help adding this submodule, please contact [PrebidUIM@33across.com](PrebidUIM@33across.com).

### Prebid Configuration

You can configure this submodule in your `userSync.userIds[]` configuration:

```javascript
pbjs.setConfig({
  userSync: {
    userIds: [
      {
        name: "33acrossId",
        storage: {
          name: "33acrossId",
          type: "cookie&html5",
          expires: 30,
          refreshInSeconds: 8*3600
        },
        params: {
          pid: "0010b00002GYU4eBAH",
        },
      },
    ],
  },
});
```

| Parameters under `userSync.userIds[]` | Scope    | Type   | Description                 | Example                                   |
| ---| --- | --- | --- | --- |
| name | Required | String | Name for the 33Across ID submodule | `"33acrossId"` |                                 |
| storage                          | Required | Object | Configures how to cache User IDs locally in the browser | See [storage settings](#storage-settings) |
| params                           | Required | Object | Parameters for 33Across ID submodule | See [params](#params)                     |

### Storage Settings

The following settings are available for the `storage` property in the `userSync.userIds[]` object:

| Param name | Scope | Type | Description | Example   |
| --- | --- | --- | --- | --- |
| name | Required | String| Name of the cookie or HTML5 local storage where the user ID will be stored | `"33acrossId"` |
| type | Required | String | `"cookie&html5"` (preferred)  or `"cookie"` or `"html5"` | `"cookie&html5"` |
| expires | Strongly Recommended | Number | How long (in days) the user ID information will be stored. 33Across recommends `30`. | `30` |
| refreshInSeconds | Strongly Recommended | Number | The interval (in seconds) for refreshing the user ID. 33Across recommends no more than 8 hours between refreshes. | `8*3600` |

### Params

The following settings are available in the `params` property in `userSync.userIds[]` object:

| Param name | Scope | Type | Description | Example |
| --- | --- | --- | --- | --- |
| pid | Required | String | Partner ID provided by 33Across | `"0010b00002GYU4eBAH"` |
| hem | Optional | String | Hashed email address in sha256 format | `"ba4235544d6c91865fbf70fa1bdb70f2d375ded1b2b946b21c675dcbe9968cdc"` |
| storeFpid | Optional | Boolean | Indicates whether a supplemental first-party ID may be stored to improve addressability, this feature is enabled by default | `true` (default) or `false` |
| storeTpid | Optional | Boolean | Indicates whether a supplemental third-party ID may be stored to improve addressability, this feature is enabled by default | `true` (default) or `false` |

### HEM Collection

33Across ID System supports user's hashed emails (HEMs). HEMs could be collected from 3 different sources in following
priority order: `hem` configuration parameter, global `_33across.hem.sha256` field or from storage (cookie or local storage).
