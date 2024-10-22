import {
  isFn,
  deepAccess,
  formatQS,
  generateUUID,
  logInfo,
  safeJSONParse,
  parseSizesInput,
} from '../src/utils.js';
import { config } from '../src/config.js';

import { BANNER } from '../src/mediaTypes.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { getStorageManager } from '../src/storageManager.js';
import { isAutoplayEnabled } from '../libraries/autoplayDetection/autoplay.js';

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 * @typedef {import('../src/adapters/bidderFactory.js').ServerResponse} ServerResponse
 * @typedef {import('../src/adapters/bidderFactory.js').validBidRequests} validBidRequests
 */

const BIDDER_CODE = 'missena';
const ENDPOINT_URL = 'https://bid.missena.io/';
const EVENTS_DOMAIN = 'events.missena.io';
const EVENTS_DOMAIN_DEV = 'events.staging.missena.xyz';

export const storage = getStorageManager({ bidderCode: BIDDER_CODE });
window.msna_ik = window.msna_ik || generateUUID();

function getSize(sizesArray) {
  const firstSize = sizesArray[0];
  if (typeof firstSize !== 'string') return {};

  const [widthStr, heightStr] = firstSize.toUpperCase().split('X');
  return {
    width: parseInt(widthStr, 10) || undefined,
    height: parseInt(heightStr, 10) || undefined,
  };
}

/* Get Floor price information */
function getFloor(bidRequest) {
  if (!isFn(bidRequest.getFloor)) {
    return {};
  }
  const sizesArray = getSizeArray(bidRequest);
  const size = getSize(sizesArray);

  const bidFloors = bidRequest.getFloor({
    currency: 'USD',
    mediaType: BANNER,
    size: [size.width, size.height],
  });

  if (!isNaN(bidFloors.floor)) {
    return bidFloors;
  }
}
function getSizeArray(bid) {
  let inputSize = deepAccess(bid, 'mediaTypes.banner.sizes') || bid.sizes || [];

  if (Array.isArray(bid.params?.size)) {
    inputSize = !Array.isArray(bid.params.size[0])
      ? [bid.params.size]
      : bid.params.size;
  }

  return parseSizesInput(inputSize);
}

function notify(bid, event) {
  const hostname = bid.params[0].baseUrl ? EVENTS_DOMAIN_DEV : EVENTS_DOMAIN;
  const headers = {
    type: 'application/json',
  };
  const blob = new Blob([JSON.stringify(event)], headers);
  navigator.sendBeacon(
    `https://${hostname}/v1/events?t=${bid.params[0].apiKey}`,
    blob,
  );
}
export const spec = {
  aliases: ['msna'],
  code: BIDDER_CODE,
  gvlid: 687,
  supportedMediaTypes: [BANNER],

  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid params to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    return typeof bid == 'object' && !!bid.params.apiKey;
  },

  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {validBidRequests[]} - an array of bids
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function (validBidRequests, bidderRequest) {
    const capKey = `missena.missena.capper.remove-bubble.${validBidRequests[0]?.params.apiKey}`;
    const capping = safeJSONParse(storage.getDataFromLocalStorage(capKey));
    const referer = bidderRequest?.refererInfo?.topmostLocation;
    if (
      typeof capping?.expiry === 'number' &&
      new Date().getTime() < capping?.expiry &&
      (!capping?.referer || capping?.referer == referer)
    ) {
      logInfo('Missena - Capped');
      return [];
    }

    tryGetMissenaSecondBid();
    return validBidRequests.map((bidRequest) => {
      const payload = {
        adunit: bidRequest.adUnitCode,
        ik: window.msna_ik,
        request_id: bidRequest.bidId,
        timeout: bidderRequest.timeout,
        ...bidRequest.params,
      };

      if (bidderRequest && bidderRequest.refererInfo) {
        // TODO: is 'topmostLocation' the right value here?
        payload.referer = bidderRequest.refererInfo.topmostLocation;
        payload.referer_canonical = bidderRequest.refererInfo.canonicalUrl;
      }

      if (bidderRequest && bidderRequest.gdprConsent) {
        payload.consent_string = bidderRequest.gdprConsent.consentString;
        payload.consent_required = bidderRequest.gdprConsent.gdprApplies;
      }

      if (bidderRequest && bidderRequest.uspConsent) {
        payload.us_privacy = bidderRequest.uspConsent;
      }

      if (bidRequest.params.isInternal) {
        payload.is_internal = bidRequest.params.isInternal;
      }

      const baseUrl = bidRequest.params.baseUrl || ENDPOINT_URL;

      if (bidRequest.ortb2?.device?.ext?.cdep) {
        payload.cdep = bidRequest.ortb2?.device?.ext?.cdep;
      }
      payload.userEids = bidRequest.userIdAsEids || [];
      payload.version = '$prebid.version$';

      if (window.MISSENA_SECOND_BID && window.MISSENA_SECOND_BID.cpm) {
        payload.floor = window.MISSENA_SECOND_BID.cpm;
      }

      const bidFloor = getFloor(bidRequest);
      payload.floor = bidFloor?.floor;
      payload.floor_currency = bidFloor?.currency;
      payload.currency = config.getConfig('currency.adServerCurrency') || 'EUR';
      payload.schain = bidRequest.schain;
      payload.coppa = config.getConfig('coppa') === true ? 1 : 0;
      payload.autoplay = isAutoplayEnabled() === true ? 1 : 0;
      payload.params = bidRequest.params;

      return {
        method: 'POST',
        url: baseUrl + '?' + formatQS({ t: bidRequest.params.apiKey }),
        data: JSON.stringify(payload),
      };
    });
  },

  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {ServerResponse} serverResponse A successful response from the server.
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: function (serverResponse, bidRequest) {
    const bidResponses = [];
    let response = serverResponse.body;
    if (typeof response !== 'object' || response === null) {
      response = {};
    }
    const secondBid = window.MISSENA_SECOND_BID;
    const isSecondBidHigher =
      secondBid && (secondBid.cpm > response.cpm || !response.cpm);
    if (isSecondBidHigher) {
      response.requestId = JSON.parse(bidRequest.data).request_id;
      Object.assign(response, {
        cpm: secondBid.cpm,
        ad: '<script>window.top.__MISSENA__.renderFromBid(window.top.MISSENA_SECOND_BID, "criteo-prebid-native")</script>',
        creativeId: '',
        currency: '',
        dealId: '',
        netRevenue: false,
        ttl: 60,
      });
    }

    if (response && !response.timeout && !!response.ad) {
      bidResponses.push(response);
    }

    return bidResponses;
  },
  getUserSyncs: function (
    syncOptions,
    serverResponses,
    gdprConsent,
    uspConsent,
  ) {
    if (!syncOptions.iframeEnabled) {
      return [];
    }

    let gdprParams = '';
    if (
      gdprConsent &&
      'gdprApplies' in gdprConsent &&
      typeof gdprConsent.gdprApplies === 'boolean'
    ) {
      gdprParams = `?gdpr=${Number(gdprConsent.gdprApplies)}&gdpr_consent=${
        gdprConsent.consentString
      }`;
    }
    return [
      { type: 'iframe', url: 'https://sync.missena.io/iframe' + gdprParams },
    ];
  },
  /**
   * Register bidder specific code, which will execute if bidder timed out after an auction
   * @param {data} Containing timeout specific data
   */
  onTimeout: (data) => {
    if (Math.random() >= 0.99) {
      // only send 1% of the timeout events
      data.forEach((bid) => {
        notify(bid, {
          name: 'timeout',
          parameters: {
            bidder: BIDDER_CODE,
            placement: bid.params[0].placement,
            t: bid.params[0].apiKey,
          },
        });
      });
    }
    logInfo('Missena - Timeout from adapter', data);
  },

  /**
   * Register bidder specific code, which@ will execute if a bid from this bidder won the auction
   * @param {Bid} The bid that won the auction
   */
  onBidWon: (bid) => {
    notify(bid, {
      name: 'bidsuccess',
      provider: bid.meta?.networkName,
      parameters: {
        t: bid.params[0].apiKey,
        placement: bid.params[0].placement,
        commission: {
          value: bid.originalCpm,
          currency: bid.originalCurrency,
        },
      },
    });
    logInfo('Missena - Bid won', bid);
  },
};

export function tryGetMissenaSecondBid() {
  try {
    const secondBidStorageKey = 'msna_script';
    const secondBidFromStorage =
      storage.getDataFromLocalStorage(secondBidStorageKey);

    if (secondBidFromStorage !== null) {
      eval(secondBidFromStorage); // eslint-disable-line no-eval
    }
  } catch (e) {
    // Unable to get second bid
  }
}

registerBidder(spec);
