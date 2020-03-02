import { Injectable } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { WebsocketResponse } from '../interfaces/websocket.interface';
import { retryWhen, tap, delay } from 'rxjs/operators';
import { StateService } from './state.service';
import { Block, Transaction } from '../interfaces/electrs.interface';

const WEB_SOCKET_PROTOCOL = (document.location.protocol === 'https:') ? 'wss:' : 'ws:';
const WEB_SOCKET_URL = WEB_SOCKET_PROTOCOL + '//' + document.location.hostname + ':' + document.location.port + '/ws';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private websocketSubject: WebSocketSubject<WebsocketResponse> = webSocket<WebsocketResponse | any>(WEB_SOCKET_URL);
  private goneOffline = false;
  private lastWant: string[] | null = null;
  private trackingTxId: string | null = null;
  private trackingAddress: string | null = null;
  private latestGitCommit = '';

  constructor(
    private stateService: StateService,
  ) {
    this.startSubscription();
  }

  startSubscription() {
    this.websocketSubject.next({'action': 'init'});
    this.websocketSubject
      .subscribe((response: WebsocketResponse) => {
        if (response.blocks && response.blocks.length) {
          const blocks = response.blocks;
          blocks.forEach((block: Block) => {
            if (block.height > this.stateService.latestBlockHeight) {
              this.stateService.latestBlockHeight = block.height;
              this.stateService.blocks$.next(block);
            }
          });
        }

        if (response.block) {
          if (response.block.height > this.stateService.latestBlockHeight) {
            this.stateService.latestBlockHeight = response.block.height;
            this.stateService.blocks$.next(response.block);
          }

          if (response.txConfirmed) {
            this.trackingTxId = null;
            this.stateService.txConfirmed$.next(response.block);
          }
        }

        if (response.conversions) {
          this.stateService.conversions$.next(response.conversions);
        }

        if (response['mempool-blocks']) {
          this.stateService.mempoolBlocks$.next(response['mempool-blocks']);
        }

        if (response['git-commit']) {
          if (!this.latestGitCommit) {
            this.latestGitCommit = response['git-commit'];
          } else {
            if (this.latestGitCommit !== response['git-commit']) {
              setTimeout(() => {
                window.location.reload();
              }, Math.floor(Math.random() * 60000) + 1000);
            }
          }
        }

        if (response['address-transactions']) {
          response['address-transactions'].forEach((addressTransaction: Transaction) => {
            this.stateService.mempoolTransactions$.next(addressTransaction);
          });
        }

        if (response['address-block-transactions']) {
          response['address-block-transactions'].forEach((addressTransaction: Transaction) => {
            this.stateService.blockTransactions$.next(addressTransaction);
          });
        }

        if (response['live-2h-chart']) {
          this.stateService.live2Chart$.next(response['live-2h-chart']);
        }

        if (response.mempoolInfo) {
          this.stateService.mempoolStats$.next({
            memPoolInfo: response.mempoolInfo,
            vBytesPerSecond: response.vBytesPerSecond,
          });
        }

        if (this.goneOffline === true) {
          this.goneOffline = false;
          if (this.lastWant) {
            this.want(this.lastWant);
          }
          if (this.trackingTxId) {
            this.startTrackTransaction(this.trackingTxId);
          }
          if (this.trackingAddress) {
            this.startTrackTransaction(this.trackingAddress);
          }
          this.stateService.isOffline$.next(false);
        }
      },
      (err: Error) => {
        console.log(err);
        this.goneOffline = true;
        this.stateService.isOffline$.next(true);
        console.log('Error, retrying in 10 sec');
        window.setTimeout(() => this.startSubscription(), 10000);
      });
  }

  startTrackTransaction(txId: string) {
    this.websocketSubject.next({ 'track-tx': txId });
    this.trackingTxId = txId;
  }

  startTrackAddress(address: string) {
    this.websocketSubject.next({ 'track-address': address });
    this.trackingAddress = address;
  }

  fetchStatistics(historicalDate: string) {
    this.websocketSubject.next({ historicalDate });
  }

  want(data: string[]) {
    this.websocketSubject.next({action: 'want', data: data});
    this.lastWant = data;
  }
}