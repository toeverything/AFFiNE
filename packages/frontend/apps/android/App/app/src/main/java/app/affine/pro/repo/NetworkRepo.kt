package app.affine.pro.repo

import app.affine.pro.service.AffineClient
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NetworkRepo @Inject constructor(
    private val client: AffineClient
) {



}