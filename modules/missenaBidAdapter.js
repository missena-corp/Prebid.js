import { formatQS, logInfo } from '../src/utils.js';
import { BANNER } from '../src/mediaTypes.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { getStorageManager } from '../src/storageManager.js';

const BIDDER_CODE = 'missena';
const ENDPOINT_URL = 'https://bid.missena.io/';
const EVENTS_DOMAIN = 'events.missena.io';
const EVENTS_DOMAIN_DEV = 'events.staging.missena.xyz';

export const storage = getStorageManager({ bidderCode: BIDDER_CODE });

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
    tryGetMissenaSecondBid();
    return validBidRequests.map((bidRequest) => {
      const payload = {
        adunit: bidRequest.adUnitCode,
        request_id: bidRequest.bidId,
        timeout: bidderRequest.timeout,
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
      const baseUrl = bidRequest.params.baseUrl || ENDPOINT_URL;
      if (bidRequest.params.test) {
        payload.test = bidRequest.params.test;
      }
      if (bidRequest.params.placement) {
        payload.placement = bidRequest.params.placement;
      }
      if (bidRequest.params.formats) {
        payload.formats = bidRequest.params.formats;
      }
      if (bidRequest.params.isInternal) {
        payload.is_internal = bidRequest.params.isInternal;
      }
      payload.userEids = bidRequest.userIdAsEids || [];
      if (window.MISSENA_SECOND_BID && window.MISSENA_SECOND_BID.cpm) {
        payload.floor = window.MISSENA_SECOND_BID.cpm;
      }

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
  onTimeout: function onTimeout(timeoutData) {
    logInfo('Missena - Timeout from adapter', timeoutData);
  },

  /**
   * Register bidder specific code, which@ will execute if a bid from this bidder won the auction
   * @param {Bid} The bid that won the auction
   */
  onBidWon: function (bid) {
    const hostname = bid.params[0].baseUrl ? EVENTS_DOMAIN_DEV : EVENTS_DOMAIN;
    const body = {
      name: 'bidsuccess',
      provider: bid.meta?.networkName,
      parameters: {
        t: bid.params[0].apiKey,
        commission: {
          value: bid.cpm,
          currency: bid.currency,
        },
      },
    };
    const headers = {
      type: 'application/json',
    };
    const blob = new Blob([JSON.stringify(body)], headers);
    navigator.sendBeacon(
      `https://${hostname}/v1/events?t=${bid.params[0].apiKey}`,
      blob,
    );
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
